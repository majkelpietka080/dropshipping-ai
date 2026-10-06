import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type Env = Record<string, string | undefined>;

export const MIN_ADMIN_TOKEN_LENGTH = 16;

// Routes reachable without the admin token. Everything else requires
// `Authorization: Bearer <APPROVAL_SECRET>`; new routes are protected by default.
export const PUBLIC_ROUTES = new Set([
  'GET /',
  'GET /health',
  'GET /allegro/oauth/start',
  'GET /allegro/oauth/callback',
  'GET /shopify/products',
  'GET /catalog/coverage',
  'GET /stores/:slug/config',
  'GET /store/config'
]);

export function isPublicRoute(method: string, url: string): boolean {
  const normalizedMethod = method === 'HEAD' ? 'GET' : method;
  return normalizedMethod === 'OPTIONS' || PUBLIC_ROUTES.has(`${normalizedMethod} ${url}`);
}

export function getAdminToken(env: Env = process.env): string | null {
  const token = env.APPROVAL_SECRET?.trim();
  return token && token.length >= MIN_ADMIN_TOKEN_LENGTH ? token : null;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; statusCode: 401 | 503; error: string };

export function checkAdminAuthorization(
  authorizationHeader: string | undefined,
  env: Env = process.env
): AdminAuthResult {
  const expected = getAdminToken(env);

  // Fail closed: without a configured secret admin routes stay unavailable.
  if (!expected) {
    return {
      ok: false,
      statusCode: 503,
      error: `Endpoint administracyjny jest wyłączony: ustaw APPROVAL_SECRET (min. ${MIN_ADMIN_TOKEN_LENGTH} znaków) w .env.`
    };
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader?.trim() ?? '');

  if (!match || !timingSafeEqual(digest(match[1].trim()), digest(expected))) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Brak autoryzacji. Wymagany nagłówek Authorization: Bearer <APPROVAL_SECRET>.'
    };
  }

  return { ok: true };
}

// Must be called before routes are registered.
export function registerAdminAuth(app: FastifyInstance, env: Env = process.env) {
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];

    if (methods.every((method) => isPublicRoute(method, routeOptions.url ?? ''))) {
      return;
    }

    const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = checkAdminAuthorization(request.headers.authorization, env);

      if (!auth.ok) {
        return reply.code(auth.statusCode).send({ ok: false, error: auth.error });
      }
    };

    const existing = routeOptions.preHandler;

    routeOptions.preHandler = [
      requireAdmin,
      ...(existing ? (Array.isArray(existing) ? existing : [existing]) : [])
    ];
  });
}

const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function toOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

// CORS_ORIGINS (comma-separated) wins; otherwise APP_URL, plus localhost:3000
// (Next.js storefront default) outside production.
export function resolveCorsOrigins(env: Env = process.env): Set<string> {
  const configured = env.CORS_ORIGINS?.split(',').filter((value) => value.trim());

  const candidates = configured?.length
    ? configured
    : [
        ...(env.APP_URL ? [env.APP_URL] : []),
        ...(env.APP_ENV === 'production' ? [] : DEV_ORIGINS)
      ];

  return new Set(
    candidates.map(toOrigin).filter((origin): origin is string => origin !== null)
  );
}

const SECRET_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_ACCESS_TOKEN',
  'APPROVAL_SECRET',
  'ALLEGRO_CLIENT_SECRET',
  'BIGBUY_API_KEY',
  'DATABASE_URL'
];

export function redactSecrets(text: string, env: Env = process.env): string {
  let result = text;

  for (const key of SECRET_ENV_KEYS) {
    const value = env[key]?.trim();

    // Very short values are placeholders and would redact unrelated text.
    if (value && value.length >= 6) {
      result = result.split(value).join('[REDACTED]');
    }
  }

  return result;
}

export function publicErrorDetails(error: unknown, env: Env = process.env): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message, env).slice(0, 500);
}

// Authorization codes and OAuth state must not end up in request logs.
export function redactUrlForLogs(url: string): string {
  return url.replace(/([?&](?:code|state)=)[^&]*/gi, '$1[REDACTED]');
}

export const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseOptionalNumber(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
