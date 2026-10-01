/**
 * Google 登入的平台層（web 版：Google Identity Services 的 token client）。
 *
 * GIS 沒有 refresh token：access token 約一小時過期，之後要再取得就得再開一次授權視窗，
 * 瀏覽器通常只在使用者操作（點擊）時才放行。所以這裡把「已登入」定義成「記得 email」，
 * token 過期時由下一次手動備份／還原重新授權；自動備份在拿不到 token 時會失敗並記錄提示。
 */

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/userinfo.email`;
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const EMAIL_KEY = 'cloud.googleEmail';
/** 比實際到期時間提早一點，避免剛拿到就失效 */
const EXPIRY_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let token: { value: string; expiresAt: number } | null = null;
let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('無法載入 Google 登入元件，請確認網路連線'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function readEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

function writeEmail(email: string | null): void {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    // 無痕模式等情況存不了，下次開啟需重新登入
  }
}

/** 向 Google 要一個 access token。prompt 為空字串＝已授權過就不再詢問。 */
async function requestToken(prompt: string): Promise<string> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw new Error('尚未設定 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  await loadGis();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new SignInRequired(response.error));
          return;
        }
        token = {
          value: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS,
        };
        resolve(response.access_token);
      },
      // 視窗被擋或使用者關閉
      error_callback: (error) => reject(new SignInRequired(error.type)),
    });
    client.requestAccessToken({ prompt });
  });
}

class SignInRequired extends Error {
  readonly code = 'SIGN_IN_REQUIRED';
  constructor(reason?: string) {
    super(reason === 'popup_closed' ? '使用者取消登入' : '需要重新登入 Google');
    this.name = 'SignInRequired';
  }
}

export function configureAuth(): void {}

export async function getSignedInEmail(): Promise<string | null> {
  return readEmail();
}

export async function signInWithGoogle(): Promise<string | null> {
  let accessToken: string;
  try {
    accessToken = await requestToken('select_account');
  } catch (error) {
    if (error instanceof Error && error.message === '使用者取消登入') return null;
    throw error;
  }
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('無法取得 Google 帳號資訊');
  const { email } = (await response.json()) as { email: string };
  writeEmail(email);
  return email;
}

export async function signOutOfGoogle(): Promise<void> {
  const current = token?.value;
  token = null;
  writeEmail(null);
  if (current && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(current);
}

export async function getAccessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.value;
  return requestToken('');
}

export async function clearCachedAccessToken(_token: string): Promise<void> {
  token = null;
}

export function isSignInRequiredError(error: unknown): boolean {
  return error instanceof SignInRequired;
}
