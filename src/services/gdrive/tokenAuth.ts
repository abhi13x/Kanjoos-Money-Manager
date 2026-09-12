const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const OAUTH_REDIRECT_EVENT = 'google-oauth-redirect';

// ─── Native bridge contract ─────────────────────────────────
// The native side (WebView2 / Android / iOS) must expose `window.NativeAuth` with
// these methods, and dispatch a `google-oauth-redirect` CustomEvent on window with
// `detail` = the full redirect URL, whenever the OAuth deep link arrives.

interface NativeAuthGlobal {
  openExternal?: (url: string) => void | Promise<void>;
  getSecureItem?: (key: string) => string | null | Promise<string | null>;
  setSecureItem?: (key: string, value: string) => void | Promise<void>;
  removeSecureItem?: (key: string) => void | Promise<void>;
  /** Optional: return a redirect URL captured during app cold-start (before JS ran). */
  consumePendingRedirect?: () => string | null | Promise<string | null>;
}

declare global {
  interface Window {
    NativeAuth?: NativeAuthGlobal;
  }
}

export interface NativeAuthBridge {
  openExternal(url: string): Promise<void>;
  getSecureItem(key: string): Promise<string | null>;
  setSecureItem(key: string, value: string): Promise<void>;
  removeSecureItem(key: string): Promise<void>;
  consumePendingRedirect?(): Promise<string | null>;
}

export class DefaultNativeAuthBridge implements NativeAuthBridge {
  async openExternal(url: string): Promise<void> {
    const native = window.NativeAuth;
    if (native?.openExternal) {
      await native.openExternal(url);
      return;
    }
    // Web fallback (dev / desktop browser) — navigate the current window.
    window.location.href = url;
  }

  async getSecureItem(key: string): Promise<string | null> {
    const native = window.NativeAuth;
    if (native?.getSecureItem) return await native.getSecureItem(key);
    try { return localStorage.getItem(key); } catch { return null; }
  }

  async setSecureItem(key: string, value: string): Promise<void> {
    const native = window.NativeAuth;
    if (native?.setSecureItem) return void (await native.setSecureItem(key, value));
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }

  async removeSecureItem(key: string): Promise<void> {
    const native = window.NativeAuth;
    if (native?.removeSecureItem) return void (await native.removeSecureItem(key));
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  async consumePendingRedirect(): Promise<string | null> {
    const native = window.NativeAuth;
    if (native?.consumePendingRedirect) {
      try { return (await native.consumePendingRedirect()) ?? null; } catch { return null; }
    }
    return null;
  }
}

// ─── PKCE helpers ───────────────────────────────────────────

const base64UrlEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomUrlSafeString = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
};

const sha256Base64Url = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncode(digest);
};

// ─── Config ─────────────────────────────────────────────────

export interface GDriveTokenAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string;
  tokenKey: string;
  expiryKey: string;
  connectedKey: string;
  refreshKey: string;
  onAuthenticated?: (token: string) => void;
  bridge?: NativeAuthBridge;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export class GDriveTokenAuth {
  private clientId: string;
  private redirectUri: string;
  private scopes: string;
  private tokenKey: string;
  private expiryKey: string;
  private connectedKey: string;
  private refreshKey: string;
  private onAuthenticated?: (token: string) => void;
  private bridge: NativeAuthBridge;

  private accessToken: string | null = null;
  private expiryAt = 0;
  private inFlightAuth: Promise<string | null> | null = null;

  constructor(config: GDriveTokenAuthConfig) {
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.scopes = config.scopes;
    this.tokenKey = config.tokenKey;
    this.expiryKey = config.expiryKey;
    this.connectedKey = config.connectedKey;
    this.refreshKey = config.refreshKey;
    this.onAuthenticated = config.onAuthenticated;
    this.bridge = config.bridge ?? new DefaultNativeAuthBridge();
  }

  configure(config: Partial<Omit<GDriveTokenAuthConfig, 'onAuthenticated' | 'bridge'>>): void {
    if (config.clientId) this.clientId = config.clientId;
    if (config.redirectUri) this.redirectUri = config.redirectUri;
    if (config.scopes) this.scopes = config.scopes;
    if (config.tokenKey) this.tokenKey = config.tokenKey;
    if (config.expiryKey) this.expiryKey = config.expiryKey;
    if (config.connectedKey) this.connectedKey = config.connectedKey;
    if (config.refreshKey) this.refreshKey = config.refreshKey;
  }

  getStorageKeys(): string[] {
    return [this.tokenKey, this.expiryKey, this.connectedKey, this.refreshKey];
  }

  // ─── State checks ─────────────────────────────────────────

  hasValidAccessToken(): boolean {
    if (this.accessToken && Date.now() < this.expiryAt - TOKEN_EXPIRY_BUFFER_MS) {
      return true;
    }
    try {
      const token = localStorage.getItem(this.tokenKey);
      const expiresAt = Number(localStorage.getItem(this.expiryKey) || 0);
      return Boolean(token && Date.now() < expiresAt - TOKEN_EXPIRY_BUFFER_MS);
    } catch {
      return false;
    }
  }

  hasStoredCredentials(): boolean {
    try {
      return localStorage.getItem(this.connectedKey) === 'true';
    } catch {
      return false;
    }
  }

  // ─── Public API ───────────────────────────────────────────

  /**
   * Interactive sign-in. Opens the system browser and waits for the redirect.
   * This is the ONLY method that should ever trigger user-visible OAuth UI.
   */
  async authenticate(): Promise<string | null> {
    if (this.inFlightAuth) return this.inFlightAuth;
    this.inFlightAuth = this.runAuthFlow().finally(() => { this.inFlightAuth = null; });
    return this.inFlightAuth;
  }

  /**
   * Returns a valid access token, refreshing silently if possible.
   * Never opens any UI. Returns `null` if the user must re-authenticate.
   */
  async getValidToken(forceInteractive = false): Promise<string | null> {
    if (this.hasValidAccessToken()) {
      if (this.accessToken) return this.accessToken;
      try { return localStorage.getItem(this.tokenKey); } catch { return null; }
    }

    const refreshed = await this.tryRefresh();
    if (refreshed) return refreshed;

    if (forceInteractive) return this.authenticate();
    return null;
  }

  /**
   * Resolves to a token or throws. **Never** triggers interactive auth —
   * background paths must not open popups.
   */
  async ensureValidToken(token?: string | null): Promise<string> {
    if (token) return token;
    const active = await this.getValidToken(false);
    if (!active) {
      throw new Error('Google Drive is not connected. Please sign in again.');
    }
    return active;
  }

  async clearTokens(): Promise<void> {
    this.accessToken = null;
    this.expiryAt = 0;
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.expiryKey);
      localStorage.removeItem(this.connectedKey);
    } catch { /* ignore */ }
    try { await this.bridge.removeSecureItem(this.refreshKey); } catch { /* ignore */ }
  }

  // ─── Auth code flow (PKCE) ────────────────────────────────

  private buildAuthUrl(state: string, challenge: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes,
      access_type: 'offline',
      // Force a refresh_token on every explicit sign-in. Without this, Google
      // only returns one on the very first consent.
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  private async runAuthFlow(): Promise<string | null> {
    const verifier = randomUrlSafeString(32);
    const challenge = await sha256Base64Url(verifier);
    const state = randomUrlSafeString(16);
    const authUrl = this.buildAuthUrl(state, challenge);

    return new Promise<string | null>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener(OAUTH_REDIRECT_EVENT, listener);
        clearTimeout(timeout);
        fn();
      };

      const listener = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (typeof detail !== 'string') return;
        void this.handleRedirect(detail, state, verifier).then(
          (token) => settle(() => resolve(token)),
          (err) => settle(() => reject(err as Error))
        );
      };

      const timeout = setTimeout(
        () => settle(() => reject(new Error('Authentication timed out.'))),
        5 * 60 * 1000
      );

      window.addEventListener(OAUTH_REDIRECT_EVENT, listener);

      // Cold start: native layer may have captured a redirect URL before we subscribed.
      void this.consumePendingRedirect().then((pending) => {
        if (pending) listener(new CustomEvent(OAUTH_REDIRECT_EVENT, { detail: pending }));
      });

      this.bridge.openExternal(authUrl).catch((err) => settle(() => reject(err as Error)));
    });
  }

  private async consumePendingRedirect(): Promise<string | null> {
    try {
      return (await this.bridge.consumePendingRedirect?.()) ?? null;
    } catch {
      return null;
    }
  }

  private async handleRedirect(url: string, expectedState: string, verifier: string): Promise<string> {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('Malformed OAuth redirect URL.'); }

    const params = parsed.searchParams;
    const error = params.get('error');
    if (error) throw new Error(`Google auth error: ${error}`);

    const state = params.get('state');
    if (state !== expectedState) throw new Error('OAuth state mismatch — possible CSRF.');

    const code = params.get('code');
    if (!code) throw new Error('Missing authorization code in redirect.');

    return this.exchangeCode(code, verifier);
  }

  private async exchangeCode(code: string, verifier: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });

    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Token exchange failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as TokenResponse;
    await this.persistTokens(data);
    this.onAuthenticated?.(data.access_token);
    return data.access_token;
  }

  // ─── Silent refresh ───────────────────────────────────────

  private async tryRefresh(): Promise<string | null> {
    let refreshToken: string | null;
    try {
      refreshToken = await this.bridge.getSecureItem(this.refreshKey);
    } catch (err) {
      console.warn('Failed to read refresh token from secure storage:', err);
      return null;
    }
    if (!refreshToken) return null;

    try {
      const body = new URLSearchParams({
        client_id: this.clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 400 && text.includes('invalid_grant')) {
          // Refresh token was revoked or expired — credentials are dead.
          await this.clearTokens();
        }
        console.warn(`Google token refresh failed (${res.status}): ${text}`);
        return null;
      }

      const data = (await res.json()) as TokenResponse;
      await this.persistTokens(data);
      return data.access_token;
    } catch (err) {
      console.warn('Google token refresh network error:', err);
      return null;
    }
  }

  private async persistTokens(data: TokenResponse): Promise<void> {
    this.accessToken = data.access_token;
    this.expiryAt = Date.now() + (data.expires_in || 3600) * 1000;

    try {
      localStorage.setItem(this.tokenKey, data.access_token);
      localStorage.setItem(this.expiryKey, String(this.expiryAt));
      localStorage.setItem(this.connectedKey, 'true');
    } catch (e) {
      console.warn('Failed to cache access token in localStorage:', e);
    }

    if (data.refresh_token) {
      try {
        await this.bridge.setSecureItem(this.refreshKey, data.refresh_token);
      } catch (e) {
        console.warn('Failed to persist refresh token in secure storage:', e);
      }
    }
  }
}