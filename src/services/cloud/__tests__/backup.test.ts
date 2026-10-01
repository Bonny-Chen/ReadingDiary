import { clearTestDb, createTestDb } from '@/db/testing';
import { bumpDataVersion, onDataVersionBump } from '@/hooks/use-data-version';
import { getGoal, setGoal } from '@/repositories/goalRepo';
import { getSetting, setSetting } from '@/repositories/settingsRepo';
import {
  AUTO_BACKUP_DEBOUNCE_MS,
  backupToCloud,
  NoCloudBackupError,
  restoreFromCloud,
  runStartupCatchUp,
  scheduleAutoBackup,
  SettingKeys,
  watchNetworkForRetry,
} from '@/services/cloud/backup';
import * as auth from '@/services/cloud/auth';
import * as drive from '@/services/cloud/googleDrive';
import * as network from '@/services/cloud/network';

// 登入與網路狀態是瀏覽器 API（Google Identity Services、online 事件），jest 裡以 mock 取代。
jest.mock('@/services/cloud/auth', () => ({
  configureAuth: jest.fn(),
  getSignedInEmail: jest.fn(async () => null),
  signInWithGoogle: jest.fn(async () => null),
  signOutOfGoogle: jest.fn(async () => undefined),
  getAccessToken: jest.fn(async () => 'token'),
  clearCachedAccessToken: jest.fn(async () => undefined),
  isSignInRequiredError: jest.fn(() => false),
}));

jest.mock('@/services/cloud/network', () => ({ subscribeOnline: jest.fn(() => jest.fn()) }));

jest.mock('@/services/cloud/googleDrive', () => ({
  ...jest.requireActual('@/services/cloud/googleDrive'),
  ensureBackupFolder: jest.fn(),
  findBackupFile: jest.fn(),
  uploadBackup: jest.fn(),
  downloadBackup: jest.fn(),
}));

const getSignedInEmail = auth.getSignedInEmail as jest.Mock;
const clearCachedAccessToken = auth.clearCachedAccessToken as jest.Mock;
const subscribeOnline = network.subscribeOnline as jest.Mock;
const ensureBackupFolder = drive.ensureBackupFolder as jest.Mock;
const findBackupFile = drive.findBackupFile as jest.Mock;
const uploadBackup = drive.uploadBackup as jest.Mock;
const downloadBackup = drive.downloadBackup as jest.Mock;

function signedIn() {
  getSignedInEmail.mockResolvedValue('me@example.com');
}

/** 讓排在 microtask 佇列裡的 async 工作跑完 */
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

let unsubscribe: () => void;

beforeEach(async () => {
  jest.useFakeTimers();
  await createTestDb();
  ensureBackupFolder.mockReset().mockResolvedValue('dir');
  findBackupFile.mockReset().mockResolvedValue(null);
  uploadBackup.mockReset().mockResolvedValue('new-id');
  downloadBackup.mockReset();
  getSignedInEmail.mockResolvedValue(null);
  unsubscribe = onDataVersionBump(scheduleAutoBackup);
});

afterEach(() => {
  unsubscribe();
  jest.useRealTimers();
  clearTestDb();
});

describe('backupToCloud', () => {
  it('沒有雲端檔就新建，並記錄備份時間', async () => {
    await backupToCloud();
    expect(uploadBackup).toHaveBeenCalledWith('token', expect.stringContaining('"version":1'), 'dir', undefined);
    expect(await getSetting(SettingKeys.lastBackupAt)).not.toBeNull();
    expect(await getSetting(SettingKeys.lastError)).toBeNull();
  });

  it('已有雲端檔就覆寫同一個 id', async () => {
    findBackupFile.mockResolvedValue({ id: 'f1', modifiedTime: 'x' });
    await backupToCloud();
    expect(uploadBackup).toHaveBeenCalledWith('token', expect.any(String), 'dir', 'f1');
  });

  it('401 時清掉 token 重試一次', async () => {
    ensureBackupFolder
      .mockRejectedValueOnce(new drive.DriveError(401))
      .mockResolvedValueOnce('dir');
    await backupToCloud();
    expect(clearCachedAccessToken).toHaveBeenCalledWith('token');
    expect(uploadBackup).toHaveBeenCalledTimes(1);
  });

  it('失敗時記下錯誤並往上丟', async () => {
    uploadBackup.mockRejectedValue(new drive.DriveError(500));
    await expect(backupToCloud()).rejects.toBeInstanceOf(drive.DriveError);
    expect(await getSetting(SettingKeys.lastError)).toContain('500');
  });
});

describe('自動備份', () => {
  it('資料異動後等防抖時間才上傳，連續異動只傳一次', async () => {
    signedIn();
    await setSetting(SettingKeys.autoBackup, '1');

    bumpDataVersion();
    bumpDataVersion();
    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS - 1);
    await flush();
    expect(uploadBackup).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flush();
    expect(uploadBackup).toHaveBeenCalledTimes(1);
  });

  it('關閉自動備份或未登入時不上傳', async () => {
    await setSetting(SettingKeys.autoBackup, '0');
    signedIn();
    bumpDataVersion();
    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
    await flush();
    expect(uploadBackup).not.toHaveBeenCalled();

    await setSetting(SettingKeys.autoBackup, '1');
    getSignedInEmail.mockResolvedValue(null);
    bumpDataVersion();
    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
    await flush();
    expect(uploadBackup).not.toHaveBeenCalled();
  });

  it('啟動時若上次異動晚於上次備份就補傳', async () => {
    signedIn();
    await setSetting(SettingKeys.lastBackupAt, '2026-01-01T00:00:00.000Z');
    await setSetting(SettingKeys.lastChangedAt, '2026-01-02T00:00:00.000Z');
    await runStartupCatchUp();
    expect(uploadBackup).toHaveBeenCalledTimes(1);

    uploadBackup.mockClear();
    await setSetting(SettingKeys.lastBackupAt, '2026-01-03T00:00:00.000Z');
    await runStartupCatchUp();
    expect(uploadBackup).not.toHaveBeenCalled();
  });
});

describe('網路恢復重試', () => {
  function emit(isConnected: boolean) {
    const listener = subscribeOnline.mock.calls[0][0];
    listener(isConnected);
  }

  it('從斷線變成連線時補傳未備份的異動，其他狀態變化不動作', async () => {
    signedIn();
    await setSetting(SettingKeys.lastBackupAt, '2026-01-01T00:00:00.000Z');
    await setSetting(SettingKeys.lastChangedAt, '2026-01-02T00:00:00.000Z');
    subscribeOnline.mockClear();
    const unwatch = watchNetworkForRetry();

    emit(true); // 一開始就在線：不是「恢復」
    await flush();
    expect(uploadBackup).not.toHaveBeenCalled();

    emit(false);
    emit(true);
    await flush();
    expect(uploadBackup).toHaveBeenCalledTimes(1);

    unwatch();
  });
});

describe('restoreFromCloud', () => {
  it('雲端沒備份時丟 NoCloudBackupError', async () => {
    await expect(restoreFromCloud()).rejects.toBeInstanceOf(NoCloudBackupError);
  });

  it('還原後資料進 DB，且不會反過來觸發自動上傳', async () => {
    signedIn();
    await setSetting(SettingKeys.autoBackup, '1');
    findBackupFile.mockResolvedValue({ id: 'f1', modifiedTime: '2026-02-01T00:00:00.000Z' });
    downloadBackup.mockResolvedValue(
      JSON.stringify({
        version: 1,
        exportedAt: 'x',
        books: [],
        quotes: [],
        categories: [],
        bookCategories: [],
        readingLogs: [],
        goals: [{ year: 2026, target_count: 42 }],
      }),
    );

    await setGoal(2026, 1);
    await restoreFromCloud();
    expect((await getGoal(2026))?.targetCount).toBe(42);

    jest.advanceTimersByTime(AUTO_BACKUP_DEBOUNCE_MS);
    await flush();
    expect(uploadBackup).not.toHaveBeenCalled();
  });

  it('「上次備份」記錄雲端檔案實際的修改時間，而不是還原當下的時間；還原時間另外記在 lastRestoreAt', async () => {
    signedIn();
    findBackupFile.mockResolvedValue({ id: 'f1', modifiedTime: '2026-02-01T00:00:00.000Z' });
    downloadBackup.mockResolvedValue(
      JSON.stringify({
        version: 1,
        exportedAt: 'x',
        books: [],
        quotes: [],
        categories: [],
        bookCategories: [],
        readingLogs: [],
        goals: [],
      }),
    );

    await restoreFromCloud();

    expect(await getSetting(SettingKeys.lastBackupAt)).toBe('2026-02-01T00:00:00.000Z');
    const restoredAt = await getSetting(SettingKeys.lastRestoreAt);
    expect(restoredAt).not.toBeNull();
    expect(restoredAt).not.toBe('2026-02-01T00:00:00.000Z');
  });
});
