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
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: '',
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
  'GET /catalog/products',
  'GET /catalog/products/:handle',
  'GET /health',
  'GET /shopify/products',
  'GET /store/config',
  'GET /stores/:slug/config',
  'POST /storefront/cart'
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

test('all 30 routes are registered', () => {
  assert.deepEqual(registeredRoutes(), [...PUBLIC_ROUTES, ...PROTECTED_ROUTES].sort());
  assert.equal(registeredRoutes().length, 30);
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
    { method: 'GET' as const, url: '/catalog/products', headers: {} },
    { method: 'GET' as const, url: '/catalog/products/travel-organizer', headers: {} },
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
    { method: 'GET', url: '/agent/products/evaluate?maxPrice=abc' },
    { method: 'GET', url: '/catalog/products?limit=0' },
    { method: 'GET', url: '/catalog/products?limit=abc' },
    { method: 'GET', url: '/catalog/products?after=bad%20cursor' }
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

// --- Public catalog -------------------------------------------------------------

const SHOPIFY_ENV = {
  SHOPIFY_SHOP_DOMAIN: 'catalog-test-shop',
  SHOPIFY_CLIENT_ID: 'catalog-test-client',
  SHOPIFY_CLIENT_SECRET: 'catalog-test-secret'
};

function catalogNode(overrides: Record<string, unknown>) {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'travel-organizer',
    title: 'Travel Organizer',
    status: 'ACTIVE',
    vendor: 'Giovetta Living',
    productType: 'Organizery',
    tags: ['giovetta'],
    images: { nodes: [{ url: 'https://cdn.example/1.jpg', altText: null }] },
    priceRange: { minVariantPrice: { amount: '49.90', currencyCode: 'PLN' } },
    variants: {
      nodes: [{
        id: 'gid://shopify/ProductVariant/11',
        title: 'Default Title',
        price: '49.90',
        availableForSale: true,
        selectedOptions: [{ name: 'Title', value: 'Default Title' }]
      }]
    },
    ...overrides
  };
}

// Serves Shopify's token and GraphQL endpoints from memory; nothing leaves the process.
async function withFakeShopify(
  graphql: (body: { query: string; variables: Record<string, unknown> }) => Response,
  run: (requests: Array<{ query: string; variables: Record<string, unknown> }>) => Promise<void>
) {
  const blockedFetch = globalThis.fetch;
  const previousEnv = Object.fromEntries(Object.keys(SHOPIFY_ENV).map((key) => [key, process.env[key]]));
  const requests: Array<{ query: string; variables: Record<string, unknown> }> = [];

  Object.assign(process.env, SHOPIFY_ENV);
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);

    if (url === `https://${SHOPIFY_ENV.SHOPIFY_SHOP_DOMAIN}.myshopify.com/admin/oauth/access_token`) {
      return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 });
    }

    if (url.startsWith(`https://${SHOPIFY_ENV.SHOPIFY_SHOP_DOMAIN}.myshopify.com/admin/api/`)) {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return graphql(body);
    }

    throw new Error(`Unexpected request in test: ${url}`);
  }) as typeof fetch;

  try {
    await run(requests);
  } finally {
    globalThis.fetch = blockedFetch;
    Object.assign(process.env, previousEnv);
  }
}

test('public catalog returns only active Giovetta products with public fields and a cursor', async () => {
  await withFakeShopify(
    () => new Response(JSON.stringify({
      data: {
        products: {
          nodes: [
            catalogNode({}),
            catalogNode({ id: 'gid://shopify/Product/2', status: 'DRAFT' }),
            catalogNode({ id: 'gid://shopify/Product/3', vendor: 'Snowboard Co' }),
            catalogNode({ id: 'gid://shopify/Product/4', tags: [] }),
            catalogNode({ id: 'gid://shopify/Product/5', productType: 'Car Lifestyle' })
          ],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-2' }
        }
      }
    }), { status: 200 }),
    async (requests) => {
      const response = await app.inject({ method: 'GET', url: '/catalog/products?limit=2&after=cursor-1' });

      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.ok, true);
      assert.equal(body.nextCursor, 'cursor-2');
      assert.deepEqual(body.products, [{
        id: 'gid://shopify/Product/1',
        handle: 'travel-organizer',
        title: 'Travel Organizer',
        price: 49.9,
        currency: 'PLN',
        images: [{ url: 'https://cdn.example/1.jpg', altText: null }],
        available: true,
        category: 'Travel & Organization',
        subcategory: 'Organizery',
        categorySlug: 'travel-organization',
        subcategorySlug: 'organizery',
        variants: [{
          id: 'gid://shopify/ProductVariant/11',
          title: 'Default Title',
          price: 49.9,
          currency: 'PLN',
          available: true,
          options: [{ name: 'Title', value: 'Default Title' }]
        }]
      }]);
      assert.doesNotMatch(response.body, /inventory|vendor|tags|status|DRAFT/i);

      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0].variables, { first: 2, after: 'cursor-1', query: 'status:active' });
    }
  );
});

test('public catalog reports Shopify failures as a generic 502 without any details', async () => {
  const failures = [
    () => new Response(JSON.stringify({ errors: [{ message: 'Throttled: internal-graphql-detail' }] }), { status: 200 }),
    () => new Response('internal-http-detail', { status: 500 })
  ];

  for (const failure of failures) {
    await withFakeShopify(failure, async () => {
      const response = await app.inject({ method: 'GET', url: '/catalog/products' });

      assert.equal(response.statusCode, 502);
      assert.deepEqual(response.json(), { ok: false, error: 'Nie udało się pobrać katalogu produktów.' });
      assert.doesNotMatch(response.body, /internal-|Throttled|GraphQL|HTTP|catalog-test-secret|fake-token/);
    });
  }
});

// Same products as Shopify returns them to the existing GET /shopify/products query.
function legacyProductEdge(id: string, productType: string) {
  return {
    node: {
      id,
      title: `Product ${id}`,
      handle: `product-${id}`,
      vendor: 'Giovetta Living',
      productType,
      tags: ['giovetta'],
      totalInventory: 1,
      featuredImage: null,
      images: { nodes: [] },
      priceRange: { minVariantPrice: { amount: '10.00', currencyCode: 'PLN' } },
      variants: { nodes: [{ id: `v-${id}`, title: 'Default', price: '10.00', compareAtPrice: null, availableForSale: true, inventoryQuantity: 1 }] }
    }
  };
}

test('catalog coverage uses the shared classification and reports unclassified product types', async () => {
  const edges = [
    legacyProductEdge('1', 'Organizery'),
    legacyProductEdge('2', ' ORGANIZERY '),
    legacyProductEdge('3', 'Biżuteria'.normalize('NFD')),
    legacyProductEdge('4', 'Travel & Organization'),
    legacyProductEdge('5', 'Car Lifestyle'),
    legacyProductEdge('6', 'Car Lifestyle'),
    legacyProductEdge('7', '')
  ];

  await withFakeShopify(
    () => new Response(JSON.stringify({ data: { products: { edges, pageInfo: { hasNextPage: false } } } }), { status: 200 }),
    async () => {
      const response = await app.inject({ method: 'GET', url: '/catalog/coverage' });

      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.productsCount, 7);
      assert.deepEqual(body.productsBySubcategory, { Organizery: 2, 'Biżuteria': 1 });
      assert.equal(body.coverage.find((entry: { subcategory: string }) => entry.subcategory === 'Organizery').availableProducts, 2);
      assert.equal(body.categoryOnlyCount, 1);
      assert.equal(body.unclassifiedCount, 3);
      assert.deepEqual(body.unknownProductTypes, [
        { productType: 'Car Lifestyle', count: 2 },
        { productType: '', count: 1 }
      ]);

      // GET /shopify/products itself is unchanged: raw productType, no classification fields.
      const raw = await app.inject({ method: 'GET', url: '/shopify/products' });
      assert.equal(raw.statusCode, 200);
      const rawProducts = raw.json().products;
      assert.deepEqual(rawProducts.map((product: { productType: string }) => product.productType), edges.map((edge) => edge.node.productType));
      assert.ok(rawProducts.every((product: Record<string, unknown>) => !('categorySlug' in product) && !('category' in product)));
      assert.ok(rawProducts.every((product: { totalInventory?: number }) => product.totalInventory === 1));
    }
  );
});

// --- Public product detail --------------------------------------------------------

const PRODUCT_DETAIL_ERROR = { ok: false, error: 'Nie udało się pobrać produktu.' };

// Answers productByIdentifier from a fixed set of products keyed by handle.
function productDetailShopify(products: Record<string, Record<string, unknown>>) {
  return (body: { query: string; variables: Record<string, unknown> }) => {
    const handle = String(body.variables.handle);
    return new Response(JSON.stringify({ data: { productByIdentifier: products[handle] ?? null } }), { status: 200 });
  };
}

const DETAIL_PRODUCTS = {
  'travel-organizer': catalogNode({ handle: 'travel-organizer' }),
  'draft-organizer': catalogNode({ handle: 'draft-organizer', status: 'DRAFT' }),
  'foreign-organizer': catalogNode({ handle: 'foreign-organizer', vendor: 'Snowboard Co' }),
  'untagged-organizer': catalogNode({ handle: 'untagged-organizer', tags: [] }),
  'sold-out-organizer': catalogNode({
    handle: 'sold-out-organizer',
    variants: { nodes: [{ id: 'gid://shopify/ProductVariant/12', title: 'Default Title', price: '49.90', availableForSale: false, selectedOptions: [] }] }
  }),
  'car-lifestyle-thing': catalogNode({ handle: 'car-lifestyle-thing', productType: 'Car Lifestyle' })
};

test('product detail returns one public Giovetta product with variants and no internal fields', async () => {
  await withFakeShopify(productDetailShopify(DETAIL_PRODUCTS), async (requests) => {
    const response = await app.inject({ method: 'GET', url: '/catalog/products/travel-organizer' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      ok: true,
      product: {
        id: 'gid://shopify/Product/1',
        handle: 'travel-organizer',
        title: 'Travel Organizer',
        price: 49.9,
        currency: 'PLN',
        images: [{ url: 'https://cdn.example/1.jpg', altText: null }],
        available: true,
        category: 'Travel & Organization',
        subcategory: 'Organizery',
        categorySlug: 'travel-organization',
        subcategorySlug: 'organizery',
        variants: [{
          id: 'gid://shopify/ProductVariant/11',
          title: 'Default Title',
          price: 49.9,
          currency: 'PLN',
          available: true,
          options: [{ name: 'Title', value: 'Default Title' }]
        }]
      }
    });
    assert.doesNotMatch(response.body, /inventory|vendor|tags|status|DRAFT/i);

    // The handle goes to Shopify as a variable of the single-product query.
    assert.equal(requests.length, 1);
    assert.match(requests[0].query, /productByIdentifier\(identifier: \{ handle: \$handle \}\)/);
    assert.deepEqual(requests[0].variables, { handle: 'travel-organizer' });
  });
});

test('product detail answers 404 for products outside the public Giovetta catalog', async () => {
  const cases = [
    'missing-product',      // Shopify has no such product
    'draft-organizer',      // DRAFT
    'foreign-organizer',    // wrong vendor
    'untagged-organizer',   // missing required tag
    'sold-out-organizer',   // requireAvailable
    'car-lifestyle-thing'   // not classified into the Giovetta taxonomy
  ];

  await withFakeShopify(productDetailShopify(DETAIL_PRODUCTS), async (requests) => {
    for (const handle of cases) {
      const response = await app.inject({ method: 'GET', url: `/catalog/products/${handle}` });

      assert.equal(response.statusCode, 404, handle);
      assert.deepEqual(response.json(), { ok: false, error: 'Produkt nie istnieje' }, handle);
      assert.doesNotMatch(response.body, /Snowboard|Car Lifestyle|DRAFT/, handle);
    }

    assert.deepEqual(requests.map((request) => request.variables.handle), cases);
  });
});

test('product detail rejects invalid handles with 400 before calling Shopify', async () => {
  const invalidHandles = [
    'Travel-Organizer',
    'travel%20organizer',
    'travel--organizer',
    '-travel',
    'travel"organizer',
    encodeURIComponent('x" } }) { shop { name } } #')
  ];

  await withFakeShopify(productDetailShopify(DETAIL_PRODUCTS), async (requests) => {
    for (const handle of invalidHandles) {
      const response = await app.inject({ method: 'GET', url: `/catalog/products/${handle}` });

      assert.equal(response.statusCode, 400, handle.slice(0, 40));
      assert.deepEqual(response.json(), { ok: false, error: 'Nieprawidłowy identyfikator produktu' });
    }

    // Fastify's default maxParamLength (100) rejects longer handles with 414 before the route runs.
    const tooLong = await app.inject({ method: 'GET', url: `/catalog/products/${'a'.repeat(101)}` });
    assert.equal(tooLong.statusCode, 414);

    assert.equal(requests.length, 0);
  });
});

test('product detail reports Shopify failures as a generic 502 without any details', async () => {
  const failures = [
    () => new Response(JSON.stringify({ errors: [{ message: 'internal-graphql-detail' }] }), { status: 200 }),
    () => new Response('internal-http-detail', { status: 500 })
  ];

  for (const failure of failures) {
    await withFakeShopify(failure, async () => {
      const response = await app.inject({ method: 'GET', url: '/catalog/products/travel-organizer' });

      assert.equal(response.statusCode, 502);
      assert.deepEqual(response.json(), PRODUCT_DETAIL_ERROR);
      assert.doesNotMatch(response.body, /internal-|GraphQL|HTTP|catalog-test-secret|fake-token/);
    });
  }
});

// --- Storefront cart --------------------------------------------------------------

// Same shop for the Admin API (variant validation) and the Storefront API (cartCreate).
const STOREFRONT_ENV = {
  SHOPIFY_SHOP_DOMAIN: 'cart-test-shop',
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'cart-test-storefront-token',
  SHOPIFY_CLIENT_ID: 'cart-test-client',
  SHOPIFY_CLIENT_SECRET: 'cart-test-client-secret'
};

const VALID_CART_LINES = [{ merchandiseId: 'gid://shopify/ProductVariant/11', quantity: 2 }];
const CART_ERROR = { ok: false, error: 'Nie udało się utworzyć koszyka Shopify.' };
const UNAVAILABLE_VARIANT = { ok: false, error: 'Wybrany wariant jest niedostępny.' };

type StorefrontRequest = { url: string; token: string | null; body: { query: string; variables: Record<string, unknown> } };
type AdminRequest = { query: string; variables: Record<string, unknown> };

function cartVariant(id: string, productOverrides: Record<string, unknown> = {}, availableForSale = true) {
  return { id, availableForSale, product: catalogNode(productOverrides) };
}

const CART_VARIANTS: Record<string, unknown> = {
  'gid://shopify/ProductVariant/11': cartVariant('gid://shopify/ProductVariant/11'),
  'gid://shopify/ProductVariant/21': cartVariant('gid://shopify/ProductVariant/21', { id: 'gid://shopify/Product/2', handle: 'second' }),
  'gid://shopify/ProductVariant/31': cartVariant('gid://shopify/ProductVariant/31', { status: 'DRAFT' }),
  'gid://shopify/ProductVariant/32': cartVariant('gid://shopify/ProductVariant/32', { vendor: 'Snowboard Co' }),
  'gid://shopify/ProductVariant/33': cartVariant('gid://shopify/ProductVariant/33', { tags: [] }),
  'gid://shopify/ProductVariant/34': cartVariant('gid://shopify/ProductVariant/34', { productType: 'Car Lifestyle' }),
  'gid://shopify/ProductVariant/35': cartVariant('gid://shopify/ProductVariant/35', {}, false)
};

// Answers the Admin API nodes(ids:) query from a fixed set of variants; unknown IDs are null.
function cartVariantsAdmin(variants: Record<string, unknown>) {
  return (body: AdminRequest) => {
    const ids = body.variables.ids as string[];
    return new Response(JSON.stringify({ data: { nodes: ids.map((id) => variants[id] ?? null) } }), { status: 200 });
  };
}

// Serves the Admin API (token + GraphQL) and the Storefront API from memory;
// nothing leaves the process.
async function withFakeStorefront(
  respond: () => Response,
  run: (requests: StorefrontRequest[], adminRequests: AdminRequest[]) => Promise<void>,
  admin: (body: AdminRequest) => Response = cartVariantsAdmin(CART_VARIANTS)
) {
  const blockedFetch = globalThis.fetch;
  const previousEnv = Object.fromEntries(Object.keys(STOREFRONT_ENV).map((key) => [key, process.env[key]]));
  const requests: StorefrontRequest[] = [];
  const adminRequests: AdminRequest[] = [];
  const shop = `https://${STOREFRONT_ENV.SHOPIFY_SHOP_DOMAIN}.myshopify.com`;

  Object.assign(process.env, STOREFRONT_ENV);
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);

    if (url === `${shop}/admin/oauth/access_token`) {
      return new Response(JSON.stringify({ access_token: 'cart-admin-token', expires_in: 3600 }), { status: 200 });
    }

    if (url.startsWith(`${shop}/admin/api/`)) {
      const body = JSON.parse(String(init?.body));
      adminRequests.push(body);
      return admin(body);
    }

    if (url.startsWith(`${shop}/api/`)) {
      requests.push({
        url,
        token: new Headers(init?.headers).get('X-Shopify-Storefront-Access-Token'),
        body: JSON.parse(String(init?.body))
      });
      return respond();
    }

    throw new Error(`Unexpected request in test: ${url}`);
  }) as typeof fetch;

  try {
    await run(requests, adminRequests);
  } finally {
    globalThis.fetch = blockedFetch;
    Object.assign(process.env, previousEnv);
  }
}

const successfulCart = () => new Response(JSON.stringify({
  data: {
    cartCreate: {
      cart: { id: 'gid://shopify/Cart/abc123', checkoutUrl: 'https://cart-test-shop.myshopify.com/cart/c/abc123' },
      userErrors: [],
      warnings: []
    }
  }
}), { status: 200 });

test('storefront cart rejects invalid lines with 400 before calling Shopify', async () => {
  const line = (id: number, quantity = 1) => ({ merchandiseId: `gid://shopify/ProductVariant/${id}`, quantity });
  const invalidBodies: unknown[] = [
    {},
    { lines: [] },
    { lines: 'not-an-array' },
    { lines: Array.from({ length: 11 }, (_, index) => line(index + 100)) },
    { lines: ['not-an-object'] },
    { lines: [{ merchandiseId: '123', quantity: 1 }] },
    { lines: [{ merchandiseId: 'gid://shopify/Product/1', quantity: 1 }] },
    { lines: [line(11, 0)] },
    { lines: [line(11, 1.5)] },
    { lines: [line(11, 11)] },
    { lines: [{ merchandiseId: 'gid://shopify/ProductVariant/11', quantity: '2' }] },
    { lines: [line(11, 1), line(11, 2)] }
  ];

  await withFakeStorefront(successfulCart, async (requests, adminRequests) => {
    for (const payload of invalidBodies) {
      const response = await app.inject({ method: 'POST', url: '/storefront/cart', payload: payload as Record<string, unknown> });

      assert.equal(response.statusCode, 400, JSON.stringify(payload).slice(0, 80));
      assert.equal(response.json().ok, false);
      assert.equal(typeof response.json().error, 'string');
    }

    assert.equal(adminRequests.length, 0);
    assert.equal(requests.length, 0);
  });
});

test('storefront cart responds 503 without Storefront API configuration', async () => {
  const response = await app.inject({ method: 'POST', url: '/storefront/cart', payload: { lines: VALID_CART_LINES } });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { ok: false, error: 'Brakuje konfiguracji Shopify Storefront API w .env' });
});

test('storefront cart responds 503 without Admin API configuration for variant validation', async () => {
  await withFakeStorefront(successfulCart, async (requests, adminRequests) => {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    process.env.SHOPIFY_CLIENT_ID = '';

    try {
      const response = await app.inject({ method: 'POST', url: '/storefront/cart', payload: { lines: VALID_CART_LINES } });

      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), { ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
      assert.equal(adminRequests.length, 0);
      assert.equal(requests.length, 0);
    } finally {
      process.env.SHOPIFY_CLIENT_ID = clientId;
    }
  });
});

test('storefront cart rejects variants outside the public Giovetta catalog without creating a cart', async () => {
  const cases = [
    'gid://shopify/ProductVariant/31', // DRAFT product
    'gid://shopify/ProductVariant/32', // wrong vendor
    'gid://shopify/ProductVariant/33', // missing required tag
    'gid://shopify/ProductVariant/34', // product not classified into the taxonomy
    'gid://shopify/ProductVariant/35', // variant not available for sale
    'gid://shopify/ProductVariant/99'  // variant does not exist
  ];

  await withFakeStorefront(successfulCart, async (requests, adminRequests) => {
    for (const merchandiseId of cases) {
      const response = await app.inject({
        method: 'POST',
        url: '/storefront/cart',
        payload: { lines: [VALID_CART_LINES[0], { merchandiseId, quantity: 1 }] }
      });

      assert.equal(response.statusCode, 400, merchandiseId);
      assert.deepEqual(response.json(), UNAVAILABLE_VARIANT, merchandiseId);
      assert.doesNotMatch(response.body, /DRAFT|Snowboard|Car Lifestyle/, merchandiseId);
    }

    assert.equal(adminRequests.length, cases.length);
    assert.equal(requests.length, 0);
  });
});

test('storefront cart reports Admin API validation failures as a generic 502 without any details', async () => {
  const failures = [
    () => new Response(JSON.stringify({ errors: [{ message: 'internal-admin-graphql-detail' }] }), { status: 200 }),
    () => new Response('internal-admin-http-detail', { status: 500 })
  ];

  for (const failure of failures) {
    await withFakeStorefront(successfulCart, async (requests) => {
      const response = await app.inject({ method: 'POST', url: '/storefront/cart', payload: { lines: VALID_CART_LINES } });

      assert.equal(response.statusCode, 502);
      assert.deepEqual(response.json(), CART_ERROR);
      assert.doesNotMatch(response.body, /internal-|GraphQL|HTTP|cart-admin-token|cart-test-client-secret/);
      assert.equal(requests.length, 0);
    }, failure);
  }
});

test('storefront cart reports Shopify failures as a generic 502 without any details', async () => {
  const failures = [
    () => new Response(JSON.stringify({ errors: [{ message: 'internal-graphql-detail' }] }), { status: 200 }),
    () => new Response(JSON.stringify({
      data: { cartCreate: { cart: null, userErrors: [{ field: ['lines'], message: 'internal-user-error-detail', code: 'INVALID' }] } }
    }), { status: 200 }),
    () => new Response(JSON.stringify({ data: { cartCreate: { cart: { id: 'gid://shopify/Cart/1' }, userErrors: [] } } }), { status: 200 }),
    () => new Response('internal-http-detail', { status: 500 })
  ];

  for (const failure of failures) {
    await withFakeStorefront(failure, async () => {
      const response = await app.inject({ method: 'POST', url: '/storefront/cart', payload: { lines: VALID_CART_LINES } });

      assert.equal(response.statusCode, 502);
      assert.deepEqual(response.json(), CART_ERROR);
      assert.doesNotMatch(response.body, /internal-|GraphQL|HTTP|cart-test-storefront-token|userErrors/);
    });
  }
});

test('storefront cart validates variants in the Admin API and then creates the cart with the same lines', async () => {
  const lines = [
    { merchandiseId: 'gid://shopify/ProductVariant/11', quantity: 2 },
    { merchandiseId: 'gid://shopify/ProductVariant/21', quantity: 10 }
  ];

  await withFakeStorefront(successfulCart, async (requests, adminRequests) => {
    const response = await app.inject({ method: 'POST', url: '/storefront/cart', payload: { lines } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      ok: true,
      cartId: 'gid://shopify/Cart/abc123',
      checkoutUrl: 'https://cart-test-shop.myshopify.com/cart/c/abc123'
    });

    // One Admin API validation query for all lines, IDs passed as a variable.
    assert.equal(adminRequests.length, 1);
    assert.match(adminRequests[0].query, /nodes\(ids: \$ids\)/);
    assert.match(adminRequests[0].query, /\.\.\. on ProductVariant/);
    assert.deepEqual(adminRequests[0].variables, { ids: lines.map((line) => line.merchandiseId) });

    // Then exactly one Storefront API cartCreate with the very same lines.
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/cart-test-shop\.myshopify\.com\/api\/[^/]+\/graphql\.json$/);
    assert.equal(requests[0].token, 'cart-test-storefront-token');
    assert.match(requests[0].body.query, /cartCreate/);
    assert.deepEqual(requests[0].body.variables, { input: { lines } });
  });
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
