import type { TokenClient } from '../../types/google';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer

export interface GDriveTokenAuthConfig {
  tokenKey: string;
  expiryKey: string;
  connectedKey: string;
  scopes: string;
  /** Invoked right after a token is successfully obtained (interactive or silent). */
  onAuthenticated?: (token: string) => void;
}

/** Handles Google Identity Services OAuth token acquisition, caching, and silent renewal. */
export class GDriveTokenAuth {
  private tokenKey: string;
  private expiryKey: string;
  private connectedKey: string;
  private scopes: string;
  private onAuthenticated?: (token: string) => void;
  private activeAuthPromise: Promise<string | null> | null = null;

  constructor(config: GDriveTokenAuthConfig) {
    this.tokenKey = config.tokenKey;
    this.expiryKey = config.expiryKey;
    this.connectedKey = config.connectedKey;
    this.scopes = config.scopes;
    this.onAuthenticated = config.onAuthenticated;
  }

  configure(config: Partial<Omit<GDriveTokenAuthConfig, 'onAuthenticated'>>): void {
    if (config.tokenKey) this.tokenKey = config.tokenKey;
    if (config.expiryKey) this.expiryKey = config.expiryKey;
    if (config.connectedKey) this.connectedKey = config.connectedKey;
    if (config.scopes) this.scopes = config.scopes;
  }

  async ensureValidToken(token?: string | null): Promise<string> {
    // 1. Check if explicitly passed token or stored token is still valid
    if (token && this.hasValidAccessToken()) {
      return token;
    }

    const cachedToken = await this.getValidToken(false);
    if (cachedToken) {
      return cachedToken;
    }

    // 2. Fall back to direct interactive sign-in
    const interactiveToken = await this.authenticate();
    if (!interactiveToken) {
      throw new Error('Authentication required. Please sign in to Google Drive.');
    }
    return interactiveToken;
  }

  /**
   * Returns true only if we have a **valid** (non‑expired) token.
   */
  hasValidAccessToken(): boolean {
    try {
      const cachedToken = localStorage.getItem(this.tokenKey);
      const expiresAt = Number(localStorage.getItem(this.expiryKey) || 0);
      return Boolean(cachedToken && Date.now() < expiresAt - TOKEN_EXPIRY_BUFFER_MS);
    } catch {
      return false;
    }
  }

  /**
   * True if the user has granted access before.
   */
  hasStoredCredentials(): boolean {
    try {
      return localStorage.getItem(this.connectedKey) === 'true';
    } catch {
      return false;
    }
  }

  getStorageKeys(): string[] {
    return [this.tokenKey, this.expiryKey, this.connectedKey];
  }

  /** Direct user-initiated interactive authentication */
  async authenticate(): Promise<string | null> {
    return this.requestAuth('select_account');
  }

  async getValidToken(forceInteractive = false): Promise<string | null> {
    if (this.hasValidAccessToken()) {
      try {
        return localStorage.getItem(this.tokenKey);
      } catch {
        return null;
      }
    }

    // Immediately trigger interactive auth if requested, avoiding extra silent attempts
    if (forceInteractive) {
      return this.requestAuth('select_account');
    }

    // Try silent renewal if previously connected
    if (this.hasStoredCredentials()) {
      try {
        const renewed = await this.requestAuth('');
        if (renewed) return renewed;
      } catch (err) {
        console.warn('Silent Google Drive token renewal failed:', err);
      }
    }

    return null;
  }

  async requestAuth(prompt: '' | 'consent' | 'select_account' = ''): Promise<string | null> {
    // Deduplicate concurrent auth requests
    if (this.activeAuthPromise) {
      return this.activeAuthPromise;
    }

    this.activeAuthPromise = new Promise<string | null>((resolve, reject) => {
      try {
        if (!window.google?.accounts?.oauth2) {
          reject(new Error('Google Identity Services SDK not loaded.'));
          return;
        }

        const client_id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!client_id) {
          reject(new Error('Google Client ID is missing in environment variables.'));
          return;
        }

        const client: TokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id,
          scope: this.scopes,
          callback: (response) => {
            if (response.error) {
              reject(new Error(typeof response.error === 'string' ? response.error : 'Authentication failed.'));
              return;
            }

            if (!response.access_token) {
              reject(new Error('No access token received.'));
              return;
            }

            const expiresInMs = (Number(response.expires_in) || 3600) * 1000;
            const expiresAt = Date.now() + expiresInMs;

            try {
              localStorage.setItem(this.tokenKey, response.access_token);
              localStorage.setItem(this.expiryKey, expiresAt.toString());
              localStorage.setItem(this.connectedKey, 'true');
            } catch {
              reject(new Error('Failed to store authentication token.'));
              return;
            }

            this.onAuthenticated?.(response.access_token);
            resolve(response.access_token);
          },
          error_callback: (error) => {
            reject(new Error(error?.message || 'Authentication popup closed or blocked.'));
          },
        });

        client.requestAccessToken({ prompt });
      } catch (error) {
        console.error('OAuth initialization failed:', error);
        reject(error);
      }
    }).finally(() => {
      this.activeAuthPromise = null;
    });

    return this.activeAuthPromise;
  }

  clearTokens(): void {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.expiryKey);
      localStorage.removeItem(this.connectedKey);
    } catch (e) {
      console.warn('Failed to clear Google Drive tokens locally:', e);
    }
  }
}