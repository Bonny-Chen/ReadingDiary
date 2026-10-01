import { bumpDataVersion } from '@/hooks/use-data-version';
import { deleteSetting, getSetting, setSetting } from '@/repositories/settingsRepo';
import { buildBackupJson, restoreFromJson } from '@/services/backup';
import {
  DriveError,
  downloadBackup,
  ensureBackupFolder,
  findBackupFile,
  uploadBackup,
} from '@/services/cloud/googleDrive';
import {
  clearCachedAccessToken,
  configureAuth,
  getAccessToken,
  getSignedInEmail,
  isSignInRequiredError,
  signInWithGoogle,
  signOutOfGoogle,
} from '@/services/cloud/auth';
import { subscribeOnline } from '@/services/cloud/network';

/**
 * Google Drive 雲端備份的協調層：登入狀態、手動備份／還原、資料異動後的自動備份。
 * Drive 的 HTTP 細節在 googleDrive.ts；備份內容的組裝／還原在 services/backup.ts。
 */

/** 連續編輯時只在最後一次異動後過這麼久才上傳 */
export const AUTO_BACKUP_DEBOUNCE_MS = 60000;

export const SettingKeys = {
  autoBackup: 'cloud.autoBackup',
  lastBackupAt: 'cloud.lastBackupAt',
  lastRestoreAt: 'cloud.lastRestoreAt',
  lastChangedAt: 'cloud.lastChangedAt',
  lastError: 'cloud.lastError',
} as const;

export class NoCloudBackupError extends Error {
  constructor() {
    super('雲端上沒有備份');
    this.name = 'NoCloudBackupError';
  }
}

export class SignInCancelledError extends Error {
  constructor() {
    super('使用者取消登入');
    this.name = 'SignInCancelledError';
  }
}

export interface CloudAccount {
  email: string;
}

export interface CloudBackupInfo {
  account: CloudAccount | null;
  autoBackup: boolean;
  lastBackupAt: string | null;
  lastRestoreAt: string | null;
  lastError: string | null;
}

export function configureGoogleSignIn(): void {
  configureAuth();
}

/** 已登入且憑證仍有效時回傳帳號，否則 null（不會跳出登入畫面）。 */
export async function getCloudAccount(): Promise<CloudAccount | null> {
  const email = await getSignedInEmail();
  return email ? { email } : null;
}

export async function signInCloud(): Promise<CloudAccount> {
  const email = await signInWithGoogle();
  if (!email) throw new SignInCancelledError();
  // 預設開啟自動備份；使用者可在設定頁關閉
  if ((await getSetting(SettingKeys.autoBackup)) === null) {
    await setSetting(SettingKeys.autoBackup, '1');
  }
  return { email };
}

export async function signOutCloud(): Promise<void> {
  cancelPendingAutoBackup();
  try {
    await signOutOfGoogle();
  } finally {
    await deleteSetting(SettingKeys.lastError);
  }
}

export async function setAutoBackupEnabled(enabled: boolean): Promise<void> {
  await setSetting(SettingKeys.autoBackup, enabled ? '1' : '0');
  if (!enabled) cancelPendingAutoBackup();
}

export async function getCloudBackupInfo(): Promise<CloudBackupInfo> {
  const [account, autoBackup, lastBackupAt, lastRestoreAt, lastError] = await Promise.all([
    getCloudAccount(),
    getSetting(SettingKeys.autoBackup),
    getSetting(SettingKeys.lastBackupAt),
    getSetting(SettingKeys.lastRestoreAt),
    getSetting(SettingKeys.lastError),
  ]);
  return { account, autoBackup: autoBackup !== '0', lastBackupAt, lastRestoreAt, lastError };
}

/** 401 時清掉快取的 token 再重試一次；其他錯誤直接往上丟。 */
async function withFreshToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getAccessToken();
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof DriveError) || error.status !== 401) throw error;
    await clearCachedAccessToken(token);
    return fn(await getAccessToken());
  }
}

const statusListeners = new Set<() => void>();

/** 備份成功／失敗後通知畫面重查狀態（設定頁的上次備份時間、錯誤訊息）。 */
export function onCloudBackupStatusChange(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function notifyStatusChange(): void {
  statusListeners.forEach((listener) => listener());
}

let inFlight: Promise<void> | null = null;

/** 把目前全部資料上傳覆蓋雲端備份。同時只會跑一份，重複呼叫共用同一個 promise。 */
export function backupToCloud(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const json = await buildBackupJson();
      await withFreshToken(async (token) => {
        const folderId = await ensureBackupFolder(token);
        const existing = await findBackupFile(token, folderId);
        await uploadBackup(token, json, folderId, existing?.id);
      });
      await setSetting(SettingKeys.lastBackupAt, new Date().toISOString());
      await deleteSetting(SettingKeys.lastError);
    } catch (error) {
      await setSetting(SettingKeys.lastError, describeError(error));
      throw error;
    } finally {
      inFlight = null;
      notifyStatusChange();
    }
  })();
  return inFlight;
}

/** 下載雲端備份並整包還原。還原本身不算「資料異動」，不會反過來觸發上傳。 */
export async function restoreFromCloud(): Promise<void> {
  cancelPendingAutoBackup();
  const { json, modifiedTime } = await withFreshToken(async (token) => {
    const folderId = await ensureBackupFolder(token);
    const existing = await findBackupFile(token, folderId);
    if (!existing) throw new NoCloudBackupError();
    return { json: await downloadBackup(token, existing.id), modifiedTime: existing.modifiedTime };
  });
  await restoreFromJson(json);
  await setSetting(SettingKeys.lastRestoreAt, new Date().toISOString());
  // 「上次備份」要顯示雲端檔案實際的修改時間，不是現在——還原不等於備份，
  // 這裡順便把它跟 lastChangedAt 對齊，本機資料已跟雲端一致，避免補傳誤判成有未備份的異動。
  await setSetting(SettingKeys.lastBackupAt, modifiedTime);
  await setSetting(SettingKeys.lastChangedAt, modifiedTime);
  suppressNextBump = true;
  bumpDataVersion();
}

// ---- 自動備份 ----

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let suppressNextBump = false;

function cancelPendingAutoBackup(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * 每次 bumpDataVersion 都會進來：記下異動時間，並在防抖時間後（若有登入且開啟自動備份）上傳。
 * 失敗只記錄在 lastError，不打擾使用者，下次異動會再試。
 */
export function scheduleAutoBackup(): void {
  if (suppressNextBump) {
    suppressNextBump = false;
    return;
  }
  void setSetting(SettingKeys.lastChangedAt, new Date().toISOString());
  cancelPendingAutoBackup();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runAutoBackupIfEnabled();
  }, AUTO_BACKUP_DEBOUNCE_MS);
}

async function runAutoBackupIfEnabled(): Promise<void> {
  if ((await getSetting(SettingKeys.autoBackup)) === '0') return;
  if (!(await getCloudAccount())) return;
  try {
    await backupToCloud();
  } catch (error) {
    console.warn('自動備份失敗', error);
  }
}

/** 上次備份之後還有異動（例如上次上傳失敗或 App 被關掉）就補傳。App 啟動與網路恢復時都會呼叫。 */
export async function runStartupCatchUp(): Promise<void> {
  const [changedAt, backedUpAt] = await Promise.all([
    getSetting(SettingKeys.lastChangedAt),
    getSetting(SettingKeys.lastBackupAt),
  ]);
  if (!changedAt) return;
  if (backedUpAt && backedUpAt >= changedAt) return;
  await runAutoBackupIfEnabled();
}

/**
 * 監聽網路狀態：從斷線變成可連線時補傳還沒備份的異動。
 * 只在「斷 → 通」的邊緣觸發，避免 Wi-Fi／行動網路切換等雜訊反覆上傳。回傳取消訂閱的函式。
 */
export function watchNetworkForRetry(): () => void {
  let wasOnline: boolean | null = null;
  return subscribeOnline((online) => {
    const cameBackOnline = wasOnline === false && online;
    wasOnline = online;
    if (!cameBackOnline) return;
    runStartupCatchUp().catch((error) => console.warn('網路恢復補備份失敗', error));
  });
}

function describeError(error: unknown): string {
  if (error instanceof DriveError) return `Google Drive 回應 ${error.status}`;
  if (isSignInRequiredError(error)) return '需要重新登入 Google';
  return error instanceof Error ? error.message : String(error);
}
