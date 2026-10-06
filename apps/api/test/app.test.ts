// Characterization tests for the real Fastify app (src/app.ts). They pin the
// current HTTP behavior so later refactors of app.ts can be verified.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const ADMIN_TOKEN = 'test-admin-secret-0123456789';
const AUTH = { authorization: `Bearer ${ADMIN_TOKEN}` };
const ALLOWED_ORIGIN = 'https://giovetta.test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const realDataDir = join(repoRoot, 'data');

async function snapshotDir(dir: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};

  for (const name of (await readdir(dir).catch(() => [])).sort()) {
    snapshot[name] = createHash('sha256').update(await readFile(join(dir, name))).digest('hex');
  }

  return snapshot;
}

// --- Isolated environment, set before the app module is imported -----------

const realDataBefore = await snapshotDir(realDataDir);
const tempRoot = await mkdtemp(join(tmpdir(), 'api-app-test-'));
const dataDir = join(tempRoot, 'data');
await mkdir(dataDir);

const now = '2026-01-01T00:00:00.000Z';
const seed = {
  'product-proposals.json': [
    { id: 'approved-product', title: 'Approved', category: 'Lifestyle', reason: 'seed', storeSlug: 'giovetta-living', status: 'approved', createdAt: now },
    { id: 'pending-product', title: 'Pending', category: 'Lifestyle', reason: 'seed', storeSlug: 'giovetta-living', status: 'pending', createdAt: now },
    { id: 'pending-to-reject', title: 'To reject', category: 'Lifestyle', reason: 'seed', storeSlug: 'giovetta-living', status: 'pending', createdAt: now }
  ],
  'store-proposals.json': [
    {
      id: 'approved-store', name: 'Seed Store', tagline: 'T', niche: 'n', productCategories: [],
      brand: {}, aiInfluencer: { enabled: false }, reason: 'seed', status: 'approved', createdAt: now
    }
  ],
  'customer-needs.json': [
    { id: 'interrupted-need', message: 'seed', urgency: 'browsing', status: 'searching', storeSlug: 'giovetta-living', createdAt: now, updatedAt: now }
  ]
};

for (const [file, content] of Object.entries(seed)) {
  await writeFile(join(dataDir, file), JSON.stringify(content));
}

// Empty values also stop packages/ai from filling them from the real .env
// (dotenv does not override variables that are already set).
Object.assign(process.env, {
  DATA_DIR: dataDir,
  APPROVAL_SECRET: ADMIN_TOKEN,
  CORS_ORIGINS: ALLOWED_ORIGIN,
  APP_ENV: 'test',
  APP_URL: '',
  DEFAULT_STORE_SLUG: '',
  SHOPIFY_SHOP_DOMAIN: '',
  SHOPIFY_SHOP: '',
  SHOPIFY_CLIENT_ID: '',
  SHOPIFY_CLIENT_SECRET: '',
  SHOPIFY_ACCESS_TOKEN: '',
  ANTHROPIC_API_KEY: '',
  BIGBUY_API_KEY: '',
  ALLEGRO_CLIENT_ID: 'test-client-id',
  ALLEGRO_CLIENT_SECRET: '',
  ALLEGRO_REDIRECT_URI: 'http://localhost:3001/allegro/oauth/callback',
  ALLEGRO_AUTH_BASE_URL: 'https://allegro.example.test',
  ALLEGRO_API_BASE_URL: ''
});

// Any outgoing HTTP call is a test failure.
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`Network access is disabled in tests: ${String(input)}`);
}) as typeof fetch;

const { app } = (await import('../src/app.js')) as { app: FastifyInstance };
app.log.level = 'silent';
await app.ready();

after(async () => {
  await app.close();
  globalThis.fetch = originalFetch;
  await rm(tempRoot, { recursive: true, force: true });
});

// --- Helpers -----------------------------------------------------------------

const PUBLIC_ROUTES = [
  'GET /',
  'GET /allegro/oauth/callback',
  'GET /allegro/oauth/start',
  'GET /catalog/coverage',
  'GET /health',
  'GET /shopify/products',
  'GET /store/config',
  'GET /stores/:slug/config'
];

const PROTECTED_ROUTES = [
  'GET /agent/customer-needs',
  'GET /agent/products/evaluate',
  'GET /agent/products/proposals',
  'GET /agent/stores/proposals',
  'GET /shopify/product-diagnostic',
  'GET /shopify/scopes',
  'GET /shopify/test',
  'GET /suppliers/search',
  'POST /agent/customer-needs',
  'POST /agent/customer-needs/:id/search',
  'POST /agent/products/:productId/fix-catalog',
  'POST /agent/products/propose',
  'POST /agent/products/propose-from-scout',
  'POST /agent/products/proposals/:id/approve',
  'POST /agent/products/proposals/:id/reject',
  'POST /agent/stores/propose',
  'POST /agent/stores/proposals/:id/approve',
  'POST /agent/stores/proposals/:id/reject',
  'POST /ai/test'
];

// Rebuilds "METHOD /path" entries from Fastify's route tree.
function registeredRoutes(): string[] {
  const tree = app.printRoutes({ commonPrefix: false });
  const prefixes: string[] = [];
  const routes: string[] = [];

  for (const line of tree.split('\n')) {
    const match = /^([│ ]*)[├└]── (.+?)(?: \(([^)]+)\))?$/.exec(line);
    if (!match) continue;

    const depth = match[1].length / 4;
    const path = (prefixes[depth - 1] ?? '') + match[2];
    prefixes[depth] = path;
    prefixes.length = depth + 1;

    for (const method of match[3]?.split(', ') ?? []) {
      if (method !== 'HEAD' && method !== 'OPTIONS') routes.push(`${method} ${path}`);
    }
  }

  return routes.sort();
}

function toUrl(route: string): { method: 'GET' | 'POST'; url: string } {
  const [method, path] = route.split(' ');
  return { method: method as 'GET' | 'POST', url: path.replace(/:(\w+)/g, '1') };
}

function setCookieHeader(value: string | string[] | number | undefined): string {
  return Array.isArray(value) ? value.join('\n') : String(value ?? '');
}

// --- Route inventory and auth ---------------------------------------------------

test('all 27 routes are registered', () => {
  assert.deepEqual(registeredRoutes(), [...PUBLIC_ROUTES, ...PROTECTED_ROUTES].sort());
  assert.equal(registeredRoutes().length, 27);
});

test('every non-public route rejects requests without a valid token', async () => {
  for (const route of PROTECTED_ROUTES) {
    const { method, url } = toUrl(route);

    const missing = await app.inject({ method, url });
    const wrong = await app.inject({ method, url, headers: { authorization: 'Bearer wrong-token-wrong-token' } });

    assert.equal(missing.statusCode, 401, `${route} without token`);
    assert.equal(wrong.statusCode, 401, `${route} with wrong token`);
    assert.equal(missing.json().ok, false);
  }
});

test('public endpoints respond without a token', async () => {
  const home = await app.inject({ method: 'GET', url: '/' });
  assert.equal(home.statusCode, 200);
  assert.match(home.headers['content-type'] ?? '', /text\/html/);
  assert.match(home.body, /Giovetta Living AI/);

  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.deepEqual(health.json(), { ok: true, service: 'dropshipping-ai-api' });

  const missingStore = await app.inject({ method: 'GET', url: '/stores/unknown-store/config' });
  assert.equal(missingStore.statusCode, 404);
  assert.equal(missingStore.json().ok, false);
});

test('public store config hides pricing and the legacy targetMargin', async () => {
  for (const url of ['/store/config', '/stores/giovetta-living/config', '/stores/casa-verde-2/config']) {
    const response = await app.inject({ method: 'GET', url });
    const { ok, store } = response.json();

    assert.equal(response.statusCode, 200, url);
    assert.equal(ok, true);
    assert.equal('pricing' in store, false, `${url} exposes pricing`);
    assert.equal('targetMargin' in store, false, `${url} exposes targetMargin`);
  }

  const giovetta = (await app.inject({ method: 'GET', url: '/store/config' })).json().store;
  assert.equal(giovetta.slug, 'giovetta-living');
  assert.equal(giovetta.currency, 'PLN');
  assert.deepEqual(giovetta.audience, { ageMin: 25, ageMax: 60 });
});

// --- Shopify without configuration --------------------------------------------

test('Shopify routes respond 503 without Shopify configuration', async () => {
  const requests = [
    { method: 'GET' as const, url: '/shopify/products', headers: {} },
    { method: 'GET' as const, url: '/catalog/coverage', headers: {} },
    { method: 'GET' as const, url: '/shopify/scopes', headers: AUTH },
    { method: 'GET' as const, url: '/shopify/test', headers: AUTH },
    { method: 'GET' as const, url: '/shopify/product-diagnostic?productId=1', headers: AUTH },
    { method: 'POST' as const, url: '/agent/products/123/fix-catalog', headers: AUTH },
    { method: 'POST' as const, url: '/agent/products/proposals/pending-product/approve', headers: AUTH }
  ];

  for (const request of requests) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 503, `${request.method} ${request.url}`);
    assert.equal(response.json().ok, false);
  }
});

// --- Validation -----------------------------------------------------------------

test('invalid requests are rejected with 400', async () => {
  const cases: Array<{ method: 'GET' | 'POST'; url: string; payload?: Record<string, unknown> }> = [
    { method: 'POST', url: '/ai/test', payload: {} },
    { method: 'POST', url: '/agent/products/propose', payload: {} },
    { method: 'POST', url: '/agent/products/propose', payload: { title: 'T', category: 'C', reason: 'R', storeSlug: '../x' } },
    { method: 'POST', url: '/agent/products/propose', payload: { title: 'T', category: 'C', reason: 'R', suggestedPrice: -1 } },
    { method: 'POST', url: '/agent/products/propose-from-scout', payload: { limit: 'abc' } },
    { method: 'POST', url: '/agent/products/propose-from-scout', payload: { storeSlug: 'Bad Slug' } },
    { method: 'POST', url: '/agent/stores/propose', payload: {} },
    { method: 'POST', url: '/agent/customer-needs', payload: {} },
    { method: 'POST', url: '/agent/customer-needs', payload: { message: 'm', urgency: 'yesterday' } },
    { method: 'POST', url: '/agent/customer-needs', payload: { message: 'm', urgency: 'browsing', budgetMax: '200' } },
    { method: 'POST', url: '/agent/customer-needs', payload: { message: 'm', urgency: 'browsing', currency: 'ZŁOTY' } },
    { method: 'POST', url: '/agent/customer-needs', payload: { message: 'm', urgency: 'browsing', storeSlug: '../x' } },
    { method: 'POST', url: '/agent/products/abc/fix-catalog' },
    { method: 'GET', url: '/suppliers/search?limit=abc' },
    { method: 'GET', url: '/agent/products/evaluate?maxPrice=abc' }
  ];

  for (const { method, url, payload } of cases) {
    const response = await app.inject({ method, url, headers: AUTH, ...(payload !== undefined ? { payload } : {}) });
    assert.equal(response.statusCode, 400, `${method} ${url} ${JSON.stringify(payload)}`);
  }
});

test('malformed JSON returns 400 in the current error format', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/agent/customer-needs',
    headers: { ...AUTH, 'content-type': 'application/json' },
    payload: '{not json'
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.deepEqual(Object.keys(body).sort(), ['error', 'ok']);
  assert.equal(body.ok, false);
  assert.equal(typeof body.error, 'string');
});

// --- Customer needs -----------------------------------------------------------

test('customer needs: interrupted search is reset, create/list/search work on test data', async () => {
  const initial = (await app.inject({ method: 'GET', url: '/agent/customer-needs', headers: AUTH })).json();
  const interrupted = initial.needs.find((need: { id: string }) => need.id === 'interrupted-need');
  assert.equal(interrupted.status, 'new');

  const created = await app.inject({
    method: 'POST',
    url: '/agent/customer-needs',
    headers: AUTH,
    payload: { message: 'Organizer podróżny', urgency: 'browsing', category: 'Travel & Organization' }
  });
  assert.equal(created.statusCode, 200);
  const need = created.json().need;
  assert.equal(need.status, 'new');
  assert.equal(need.currency, 'PLN');
  assert.equal(need.storeSlug, 'giovetta-living');

  const listed = (await app.inject({ method: 'GET', url: '/agent/customer-needs', headers: AUTH })).json();
  assert.equal(listed.count, 2);
  assert.ok(listed.needs.some((item: { id: string }) => item.id === need.id));

  const search = await app.inject({ method: 'POST', url: `/agent/customer-needs/${need.id}/search`, headers: AUTH });
  assert.equal(search.statusCode, 200);
  const result = search.json();
  assert.ok(['matched', 'no_match'].includes(result.status), `unexpected status ${result.status}`);
  assert.equal(result.need.status, result.status);
  assert.ok(Array.isArray(result.supplierErrors));

  if (result.status === 'matched') {
    const proposals = (await app.inject({ method: 'GET', url: '/agent/products/proposals', headers: AUTH })).json().proposals;
    for (const match of result.matches) {
      assert.ok(proposals.some((proposal: { id: string }) => proposal.id === match.proposalId));
    }
  }

  const persisted = JSON.parse(await readFile(join(dataDir, 'customer-needs.json'), 'utf8'));
  assert.equal(persisted.find((item: { id: string }) => item.id === need.id).status, result.status);

  const unknown = await app.inject({ method: 'POST', url: '/agent/customer-needs/unknown/search', headers: AUTH });
  assert.equal(unknown.statusCode, 404);
});

// --- Approve / reject ---------------------------------------------------------

test('product proposals: 404 for unknown, 409 for already approved, reject of pending works', async () => {
  const unknown = await app.inject({ method: 'POST', url: '/agent/products/proposals/unknown/approve', headers: AUTH });
  assert.equal(unknown.statusCode, 404);

  const approveApproved = await app.inject({ method: 'POST', url: '/agent/products/proposals/approved-product/approve', headers: AUTH });
  assert.equal(approveApproved.statusCode, 409);

  const rejectApproved = await app.inject({ method: 'POST', url: '/agent/products/proposals/approved-product/reject', headers: AUTH });
  assert.equal(rejectApproved.statusCode, 409);

  const rejected = await app.inject({ method: 'POST', url: '/agent/products/proposals/pending-to-reject/reject', headers: AUTH });
  assert.equal(rejected.statusCode, 200);
  assert.equal(rejected.json().proposal.status, 'rejected');

  const rejectAgain = await app.inject({ method: 'POST', url: '/agent/products/proposals/pending-to-reject/reject', headers: AUTH });
  assert.equal(rejectAgain.statusCode, 409);
});

test('store proposals: 404 for unknown and 409 for already approved', async () => {
  const unknown = await app.inject({ method: 'POST', url: '/agent/stores/proposals/unknown/approve', headers: AUTH });
  assert.equal(unknown.statusCode, 404);

  const approveApproved = await app.inject({ method: 'POST', url: '/agent/stores/proposals/approved-store/approve', headers: AUTH });
  assert.equal(approveApproved.statusCode, 409);

  const rejectApproved = await app.inject({ method: 'POST', url: '/agent/stores/proposals/approved-store/reject', headers: AUTH });
  assert.equal(rejectApproved.statusCode, 409);
});

// --- Allegro OAuth --------------------------------------------------------------

test('Allegro OAuth start redirects with a state bound to an HttpOnly cookie', async () => {
  const response = await app.inject({ method: 'GET', url: '/allegro/oauth/start' });

  assert.equal(response.statusCode, 302);
  const location = new URL(String(response.headers.location));
  assert.equal(location.origin + location.pathname, 'https://allegro.example.test/auth/oauth/authorize');
  assert.equal(location.searchParams.get('client_id'), 'test-client-id');

  const state = location.searchParams.get('state');
  const cookie = setCookieHeader(response.headers['set-cookie']);
  assert.ok(state);
  assert.match(cookie, new RegExp(`allegro_oauth_state=${state}`));
  assert.match(cookie, /HttpOnly/);
});

test('Allegro OAuth callback rejects invalid state', async () => {
  const forged = await app.inject({ method: 'GET', url: '/allegro/oauth/callback?code=abc&state=forged' });
  assert.equal(forged.statusCode, 400);
  assert.match(forged.json().error, /Invalid or expired OAuth state/);

  const start = await app.inject({ method: 'GET', url: '/allegro/oauth/start' });
  const state = new URL(String(start.headers.location)).searchParams.get('state');

  const mismatched = await app.inject({
    method: 'GET',
    url: `/allegro/oauth/callback?code=abc&state=${state}`,
    headers: { cookie: 'allegro_oauth_state=other-value' }
  });
  assert.equal(mismatched.statusCode, 400);
});

// --- CORS ---------------------------------------------------------------------

test('CORS allows only configured origins', async () => {
  const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: ALLOWED_ORIGIN } });
  const denied = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } });
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/agent/products/proposals',
    headers: { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'GET' }
  });

  assert.equal(allowed.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], ALLOWED_ORIGIN);
});

// --- Isolation ------------------------------------------------------------------

test('tests write only to the temporary DATA_DIR, never to the real data/', async () => {
  assert.deepEqual(await snapshotDir(realDataDir), realDataBefore);

  const written = await readdir(dataDir);
  assert.ok(written.includes('customer-needs.json'));
  assert.ok(written.includes('product-proposals.json'));
});
