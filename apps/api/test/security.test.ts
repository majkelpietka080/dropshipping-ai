import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  checkAdminAuthorization,
  publicErrorDetails,
  redactSecrets,
  redactUrlForLogs,
  registerAdminAuth,
  resolveCorsOrigins
} from '../src/security.js';

const SECRET = 'test-admin-secret-0123456789';

async function buildApp(env: Record<string, string | undefined>) {
  const app = Fastify();
  const origins = resolveCorsOrigins(env);
  await app.register(cors, {
    origin: (origin, callback) => callback(null, origin !== undefined && origins.has(origin))
  });
  registerAdminAuth(app, env);
  app.get('/health', async () => ({ ok: true }));
  app.get('/stores/:slug/config', async () => ({ ok: true }));
  app.get('/agent/products/proposals', async () => ({ ok: true }));
  app.post('/agent/products/proposals/:id/approve', async () => ({ ok: true }));
  await app.ready();
  return app;
}

test('admin routes fail closed with 503 when APPROVAL_SECRET is missing or too short', async () => {
  for (const secret of [undefined, '', 'short']) {
    const app = await buildApp({ APPROVAL_SECRET: secret });
    const response = await app.inject({ method: 'GET', url: '/agent/products/proposals' });
    assert.equal(response.statusCode, 503);
    assert.match(response.json().error, /APPROVAL_SECRET/);
  }
});

test('admin routes require the correct bearer token', async () => {
  const app = await buildApp({ APPROVAL_SECRET: SECRET });

  const missing = await app.inject({ method: 'POST', url: '/agent/products/proposals/x/approve' });
  const wrong = await app.inject({
    method: 'POST',
    url: '/agent/products/proposals/x/approve',
    headers: { authorization: 'Bearer wrong-token-wrong-token' }
  });
  const ok = await app.inject({
    method: 'POST',
    url: '/agent/products/proposals/x/approve',
    headers: { authorization: `Bearer ${SECRET}` }
  });

  assert.equal(missing.statusCode, 401);
  assert.equal(wrong.statusCode, 401);
  assert.equal(ok.statusCode, 200);
});

test('HEAD requests to admin routes are protected too', async () => {
  const app = await buildApp({ APPROVAL_SECRET: SECRET });
  const response = await app.inject({ method: 'HEAD', url: '/agent/products/proposals' });
  assert.equal(response.statusCode, 401);
});

test('public routes stay reachable without a token', async () => {
  const app = await buildApp({});

  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/stores/giovetta-living/config' })).statusCode, 200);
});

test('CORS allows only configured origins and keeps preflight working', async () => {
  const app = await buildApp({ APPROVAL_SECRET: SECRET, CORS_ORIGINS: 'https://giovetta.example' });

  const allowed = await app.inject({
    method: 'GET', url: '/health', headers: { origin: 'https://giovetta.example' }
  });
  const denied = await app.inject({
    method: 'GET', url: '/health', headers: { origin: 'https://evil.example' }
  });
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/agent/products/proposals',
    headers: { origin: 'https://giovetta.example', 'access-control-request-method': 'GET' }
  });

  assert.equal(allowed.headers['access-control-allow-origin'], 'https://giovetta.example');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'https://giovetta.example');
});

test('CORS origin defaults depend on environment', () => {
  assert.deepEqual(
    [...resolveCorsOrigins({ APP_URL: 'http://localhost:3000/', APP_ENV: 'development' })],
    ['http://localhost:3000', 'http://127.0.0.1:3000']
  );
  assert.deepEqual(
    [...resolveCorsOrigins({ APP_URL: 'https://shop.example/path', APP_ENV: 'production' })],
    ['https://shop.example']
  );
  assert.deepEqual([...resolveCorsOrigins({ APP_ENV: 'production' })], []);
  assert.deepEqual(
    [...resolveCorsOrigins({ CORS_ORIGINS: 'https://a.example, not-a-url ,https://b.example', APP_URL: 'https://c.example' })],
    ['https://a.example', 'https://b.example']
  );
});

test('authorization header parsing', () => {
  const env = { APPROVAL_SECRET: SECRET };
  assert.equal(checkAdminAuthorization(`bearer ${SECRET}`, env).ok, true);
  assert.equal(checkAdminAuthorization(SECRET, env).ok, false);
  assert.equal(checkAdminAuthorization(undefined, env).ok, false);
});

test('secrets are redacted from error details and logs', () => {
  const env = { SHOPIFY_CLIENT_SECRET: 'shpss_supersecretvalue', ALLEGRO_CLIENT_SECRET: 'abc' };

  assert.equal(
    redactSecrets('failed with shpss_supersecretvalue; abc stays', env),
    'failed with [REDACTED]; abc stays'
  );
  assert.equal(publicErrorDetails(new Error('x shpss_supersecretvalue'), env), 'x [REDACTED]');
  assert.equal(
    redactUrlForLogs('/allegro/oauth/callback?code=AUTHCODE&state=STATE&x=1'),
    '/allegro/oauth/callback?code=[REDACTED]&state=[REDACTED]&x=1'
  );
});
