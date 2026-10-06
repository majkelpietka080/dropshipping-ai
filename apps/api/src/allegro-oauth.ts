import { randomBytes } from 'node:crypto';

export const ALLEGRO_STATE_COOKIE = 'allegro_oauth_state';
export const ALLEGRO_CALLBACK_PATH = '/allegro/oauth/callback';
const STATE_TTL_MS = 10 * 60 * 1000;

// Single-use OAuth `state` values. The state is random and carries no secret;
// it is also set as an HttpOnly cookie so the callback is bound to the
// browser that started the flow (protects against login CSRF).
export class OAuthStateStore {
  private readonly states = new Map<string, number>();

  constructor(
    private readonly ttlMs = STATE_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  create(): string {
    this.prune();
    const state = randomBytes(32).toString('base64url');
    this.states.set(state, this.now() + this.ttlMs);
    return state;
  }

  consume(state: string | undefined, cookieState: string | undefined): boolean {
    this.prune();

    if (!state || !cookieState || state !== cookieState) {
      return false;
    }

    const expiresAt = this.states.get(state);
    this.states.delete(state);

    return expiresAt !== undefined && expiresAt > this.now();
  }

  private prune() {
    const now = this.now();

    for (const [state, expiresAt] of this.states) {
      if (expiresAt <= now) {
        this.states.delete(state);
      }
    }
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');

    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

export function stateCookie(value: string, secure: boolean, maxAgeSeconds = STATE_TTL_MS / 1000): string {
  return [
    `${ALLEGRO_STATE_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/allegro/oauth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

export function clearStateCookie(secure: boolean): string {
  return stateCookie('', secure, 0);
}

// Returns a human-readable problem when ALLEGRO_REDIRECT_URI cannot reach this API's callback.
export function checkRedirectUri(redirectUri: string, appPort: number): string | null {
  let url: URL;

  try {
    url = new URL(redirectUri);
  } catch {
    return `ALLEGRO_REDIRECT_URI nie jest poprawnym URL: ${redirectUri}`;
  }

  if (url.pathname !== ALLEGRO_CALLBACK_PATH) {
    return `ALLEGRO_REDIRECT_URI powinien wskazywać ścieżkę ${ALLEGRO_CALLBACK_PATH}, a wskazuje ${url.pathname}.`;
  }

  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));

  if (isLocal && port !== appPort) {
    return `ALLEGRO_REDIRECT_URI używa portu ${port}, a API działa na porcie ${appPort} (APP_PORT).`;
  }

  return null;
}
