import Fastify, { type FastifyError, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { askClaude } from '@dropshipping/ai';
import {
  createStoreConfig,
  toPublicStoreConfig,
  type StoreConfig,
  type StoreProposal
} from '@dropshipping/stores';
import { loadJsonArray, saveJsonArray } from './storage.js';
import { findAvailableStoreSlug, loadStoreConfig, writeStoreConfigFiles } from './store-files.js';
import { getShopifyConfig } from './shopify-config.js';
import {
  evaluateProduct,
  createSalesOpportunity,
  analyzeCompetition,
  convertCurrency,
  normalizeCurrencyCode,
  FrankfurterExchangeRateProvider,
  evaluateCatalogCoverage,
  countProductsBySubcategory
} from '@dropshipping/product-scout';
import {
  STORE_SLUG_PATTERN,
  publicErrorDetails,
  redactUrlForLogs,
  registerAdminAuth,
  resolveCorsOrigins
} from './security.js';
import {
  ALLEGRO_STATE_COOKIE,
  OAuthStateStore,
  clearStateCookie,
  readCookie,
  stateCookie
} from './allegro-oauth.js';
import {
  InFlightGuard,
  approveProductProposal,
  toShopifyProductGid
} from './product-approval.js';
import {
  productScoutSettings,
  resolveDefaultStoreSlug,
  shopifyProductAttributes
} from './store-settings.js';
import {
  loadStoreForRequest,
  parseNumberParams,
  sendStoreConfigError,
  sendUpstreamError
} from './http-helpers.js';
import { searchSuppliers } from './supplier-search.js';

// Computed here, after dotenv.config(), so .env values are visible.
const DEFAULT_STORE_SLUG = resolveDefaultStoreSlug();

export const app = Fastify({
  logger: {
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: redactUrlForLogs(request.url),
          remoteAddress: request.ip
        };
      }
    }
  }
});

export const corsOrigins = resolveCorsOrigins();

await app.register(cors, {
  origin: (origin, callback) => {
    callback(null, origin !== undefined && corsOrigins.has(origin));
  }
});

// Registered before any route so every non-public route gets the admin check.
registerAdminAuth(app);

app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error(error);

  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

  return reply.code(statusCode).send({
    ok: false,
    error: statusCode < 500 ? publicErrorDetails(error) : 'Wewnętrzny błąd serwera.'
  });
});

const allegroStates = new OAuthStateStore();
const isSecureCookie = (process.env.ALLEGRO_REDIRECT_URI ?? '').startsWith('https://');

app.get('/allegro/oauth/start', async (_request, reply) => {
  const clientId = process.env.ALLEGRO_CLIENT_ID;
  const redirectUri = process.env.ALLEGRO_REDIRECT_URI;
  const authBaseUrl =
    process.env.ALLEGRO_AUTH_BASE_URL ??
    'https://allegro.pl.allegrosandbox.pl';

  if (!clientId || !redirectUri) {
    return reply.code(500).send({
      error: 'Allegro OAuth is not configured'
    });
  }

  const authorizationUrl = new URL(
    '/auth/oauth/authorize',
    authBaseUrl
  );

  const state = allegroStates.create();

  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('state', state);

  reply.header('Set-Cookie', stateCookie(state, isSecureCookie));
  return reply.redirect(authorizationUrl.toString());
});
app.get('/allegro/oauth/callback', async (request, reply) => {
  const query = request.query as {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  };

  const stateIsValid = allegroStates.consume(
    query.state,
    readCookie(request.headers.cookie, ALLEGRO_STATE_COOKIE)
  );

  reply.header('Set-Cookie', clearStateCookie(isSecureCookie));

  if (!stateIsValid) {
    return reply.code(400).send({
      error: 'Invalid or expired OAuth state. Start again from /allegro/oauth/start.'
    });
  }

  if (query.error) {
    return reply.code(400).send({
      error: query.error,
      error_description: query.error_description
    });
  }

  if (!query.code) {
    return reply.code(400).send({
      error: 'Missing Allegro authorization code'
    });
  }

  const clientId = process.env.ALLEGRO_CLIENT_ID;
  const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
  const redirectUri = process.env.ALLEGRO_REDIRECT_URI;
  const authBaseUrl =
    process.env.ALLEGRO_AUTH_BASE_URL ??
    'https://allegro.pl.allegrosandbox.pl';

  if (!clientId || !clientSecret || !redirectUri) {
    return reply.code(500).send({
      error: 'Allegro OAuth is not configured'
    });
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString('base64');

  let tokenResponse: Response;
  let tokenData: {
    token_type?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  try {
    tokenResponse = await fetch(
      new URL('/auth/oauth/token', authBaseUrl),
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: query.code,
          redirect_uri: redirectUri
        }),
        signal: AbortSignal.timeout(15_000)
      }
    );

    tokenData = await tokenResponse.json().catch(() => ({}));
  } catch (error) {
    return sendUpstreamError(request, reply, 'Allegro token exchange failed', error);
  }

  if (!tokenResponse.ok) {
    // Only Allegro's error code/description are forwarded, never the raw body.
    return reply.code(502).send({
      error: 'Allegro token exchange failed',
      upstreamStatus: tokenResponse.status,
      details: {
        error: tokenData.error,
        error_description: tokenData.error_description
      }
    });
  }

  return reply.send({
    ok: true,
    message: 'Allegro authorization successful',
    token_type: tokenData.token_type,
    expires_in: tokenData.expires_in
  });
});

app.get('/health', async () => ({ ok: true, service: 'dropshipping-ai-api' }));

app.post('/ai/test', async (request, reply) => {
  const body = request.body as { prompt?: string } | undefined;
  if (!body?.prompt) return reply.code(400).send({ error: 'prompt is required' });

  try {
    return { response: await askClaude(body.prompt) };
  } catch (error) {
    return sendUpstreamError(request, reply, 'Zapytanie do Claude nie powiodło się.', error);
  }
});


type ShopifyProductsData = {
  products: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        handle: string;
        vendor: string;
        productType: string;
        tags: string[];
        totalInventory: number;
        featuredImage: { url: string; altText: string | null } | null;
        images: { nodes: Array<{ url: string; altText: string | null }> };
        priceRange: {
          minVariantPrice: { amount: string; currencyCode: string };
        };
        variants: {
          nodes: Array<{
            id: string;
            title: string;
            price: string;
            compareAtPrice: string | null;
            availableForSale: boolean;
            inventoryQuantity: number | null;
          }>;
        };
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
    };
  };
};

app.get('/shopify/products', async (request, reply) => {
  const { createShopifyClient } = await import('@dropshipping/shopify');

  const store = await loadStoreConfig(DEFAULT_STORE_SLUG);
  const config = getShopifyConfig();

  if (!config) {
    return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
  }

  const client = createShopifyClient(config);

  let data: ShopifyProductsData;

  try {
    data = await client.query<ShopifyProductsData>(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            vendor
            productType
            tags
            totalInventory
            featuredImage {
              url
              altText
            }
            images(first: 5) {
              nodes {
                url
                altText
              }
            }
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 10) {
              nodes {
                id
                title
                price
                compareAtPrice
                availableForSale
                inventoryQuantity
              }
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `);
  } catch (error) {
    return sendUpstreamError(request, reply, 'Nie udało się pobrać produktów Shopify.', error);
  }

  const products = data.products.edges
    .map(({ node }) => node)
    .filter((product) => {
      const catalog = store.catalog;

      if (catalog?.shopifyVendor && product.vendor.toLowerCase() !== catalog.shopifyVendor.toLowerCase()) {
        return false;
      }

      if (
        catalog?.excludeProductTypes?.some(
          (type) => product.productType.toLowerCase() === type.toLowerCase()
        )
      ) {
        return false;
      }

      if (
        catalog?.requiredTags?.length &&
        !catalog.requiredTags.every((requiredTag) =>
          product.tags.some((tag) => tag.toLowerCase() === requiredTag.toLowerCase())
        )
      ) {
        return false;
      }

      if (
        catalog?.requireAvailable &&
        !product.variants.nodes.some((variant) => variant.availableForSale)
      ) {
        return false;
      }

      return true;
    });

  return {
    ok: true,
    products,
    hasNextPage: data.products.pageInfo.hasNextPage
  };
});


app.post('/agent/products/:productId/fix-catalog', async (request, reply) => {
  const { productId } = request.params as { productId: string };
  const productGid = toShopifyProductGid(productId);

  if (!productGid) {
    return reply.code(400).send({
      ok: false,
      error: 'Nieprawidłowy identyfikator produktu Shopify.'
    });
  }

  const { createShopifyClient, tagShopifyProduct, setShopifyProductInventory } = await import('@dropshipping/shopify');
  const shopifyConfig = getShopifyConfig();

  if (!shopifyConfig) {
    return reply.code(503).send({
      ok: false,
      error: 'Brakuje konfiguracji Shopify w .env'
    });
  }

  const store = await loadStoreConfig(DEFAULT_STORE_SLUG);
  const requiredTags = store.catalog?.requiredTags?.length ? store.catalog.requiredTags : ['giovetta'];

  try {
    const { product } = await createShopifyClient(shopifyConfig).query<{
      product: { id: string; vendor: string; tags: string[] } | null;
    }>(`
      query catalogProduct($id: ID!) {
        product(id: $id) {
          id
          vendor
          tags
        }
      }
    `, { id: productGid });

    if (!product) {
      return reply.code(404).send({
        ok: false,
        error: 'Produkt nie istnieje w Shopify.'
      });
    }

    // Only products of this store's catalog may be modified, never other vendors' products.
    const vendor = store.catalog?.shopifyVendor ?? store.name;

    if (product.vendor.toLowerCase() !== vendor.toLowerCase()) {
      return reply.code(403).send({
        ok: false,
        error: `Produkt nie należy do katalogu sklepu (vendor: ${product.vendor}).`
      });
    }

    // productUpdate replaces tags, so keep the existing ones.
    const tags = Array.from(new Set([...product.tags, ...requiredTags]));

    await tagShopifyProduct(shopifyConfig, product.id, tags);
    await setShopifyProductInventory(shopifyConfig, product.id, 1);
  } catch (error) {
    return sendUpstreamError(request, reply, 'Nie udało się przygotować produktu do katalogu.', error);
  }

  return {
    ok: true,
    message: 'Produkt został przygotowany do katalogu.',
    productId
  };
});

app.get('/shopify/product-diagnostic', async (request, reply) => {
  const { createShopifyClient } = await import('@dropshipping/shopify');
  const config = getShopifyConfig();

  if (!config) {
    return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
  }

  const { productId } = request.query as { productId?: string };
  const productGid = toShopifyProductGid(productId);

  if (!productGid) {
    return reply.code(400).send({
      ok: false,
      error: 'Parametr productId (liczbowe ID lub GID produktu Shopify) jest wymagany.'
    });
  }

  const client = createShopifyClient(config);

  try {
    const data = await client.query<{
      product: {
        id: string;
        title: string;
        vendor: string;
        productType: string;
        status: string;
        tags: string[];
        totalInventory: number;
        variants: {
          nodes: Array<{
            availableForSale: boolean;
            inventoryQuantity: number | null;
          }>;
        };
      } | null;
    }>(`
      query productDiagnostic($id: ID!) {
        product(id: $id) {
          id
          title
          vendor
          productType
          status
          tags
          totalInventory
          variants(first: 10) {
            nodes {
              availableForSale
              inventoryQuantity
            }
          }
        }
      }
    `, { id: productGid });

    if (!data.product) {
      return reply.code(404).send({ ok: false, error: 'Produkt nie istnieje w Shopify.' });
    }

    return { ok: true, product: data.product };
  } catch (error) {
    return sendUpstreamError(request, reply, 'Nie udało się pobrać diagnostyki produktu.', error);
  }
});

app.get('/catalog/coverage', async (_request, reply) => {
  try {
    const store = await loadStoreConfig(DEFAULT_STORE_SLUG);

    if (!store.catalogCoverage) {
      return reply.code(400).send({
        ok: false,
        error: 'Brak konfiguracji catalogCoverage dla sklepu.'
      });
    }

    const shopifyResponse = await app.inject({
      method: 'GET',
      url: '/shopify/products'
    });

    if (shopifyResponse.statusCode !== 200) {
      const upstream = shopifyResponse.json() as { error?: string };

      return reply.code(shopifyResponse.statusCode === 503 ? 503 : 502).send({
        ok: false,
        error: upstream.error ?? 'Nie udało się pobrać produktów Shopify.',
        statusCode: shopifyResponse.statusCode
      });
    }

    const shopifyData = shopifyResponse.json() as {
      ok: boolean;
      products: Array<{ productType?: string; title?: string }>;
    };

    const products = shopifyData.products.map((product) => ({
      subcategory: product.productType
    }));

    const productsBySubcategory = countProductsBySubcategory(products);
    const coverage = evaluateCatalogCoverage(
      store.catalogCoverage,
      productsBySubcategory
    );

    return {
      ok: true,
      productsCount: products.length,
      productsBySubcategory,
      coverage
    };
  } catch (error) {
    _request.log.error(error);
    return reply.code(500).send({
      ok: false,
      error: 'Nie udało się obliczyć pokrycia katalogu.'
    });
  }
});


const storeProposals = new Map<string, StoreProposal>(
  (await loadJsonArray<StoreProposal>('store-proposals.json')).map((item) => [item.id, item])
);

const storeProposalOperations = new InFlightGuard();

app.post("/agent/stores/propose", async (request, reply) => {
  const body = request.body as {
    name: string;
    tagline: string;
    niche: string;
    productCategories: string[];
    brand: { primaryColor?: string; secondaryColor?: string; style?: string };
    aiInfluencer: { enabled: boolean; name?: string; ageRange?: string; personality?: string[] };
    reason: string;
  } | undefined;

  if (
    typeof body?.name !== 'string' || !body.name.trim() ||
    typeof body.tagline !== 'string' ||
    typeof body.niche !== 'string' ||
    !Array.isArray(body.productCategories)
  ) {
    return reply.code(400).send({
      ok: false,
      error: 'name, tagline, niche i productCategories są wymagane'
    });
  }

  // Explicit fields only: the body must not override id, status or createdAt.
  const proposal: StoreProposal = {
    id: crypto.randomUUID(),
    name: body.name,
    tagline: body.tagline,
    niche: body.niche,
    productCategories: body.productCategories,
    brand: body.brand ?? {},
    aiInfluencer: body.aiInfluencer ?? { enabled: false },
    reason: body.reason,
    status: "pending" as const,
    createdAt: new Date().toISOString()
  };

  storeProposals.set(proposal.id, proposal);
  await saveJsonArray('store-proposals.json', Array.from(storeProposals.values()));

  return reply.code(201).send({ ok: true, proposal });
});

app.get("/agent/stores/proposals", async () => {
  return {
    ok: true,
    proposals: Array.from(storeProposals.values())
  };
});

app.post("/agent/stores/proposals/:id/approve", async (request, reply) => {
  const { id } = request.params as { id: string };
  const proposal = storeProposals.get(id);

  if (!proposal) {
    return reply.code(404).send({ ok: false, error: "Propozycja sklepu nie istnieje" });
  }

  if (proposal.status !== "pending") {
    return reply.code(409).send({ ok: false, error: `Propozycja ma już status: ${proposal.status}` });
  }

  if (!storeProposalOperations.tryAcquire(id)) {
    return reply.code(409).send({ ok: false, error: "Ta propozycja jest właśnie przetwarzana" });
  }

  let storeSlug: string;

  try {
    storeSlug = await findAvailableStoreSlug(proposal.name);
    const config = createStoreConfig({
      id: proposal.id,
      name: proposal.name,
      tagline: proposal.tagline,
      niche: proposal.niche,
      productCategories: proposal.productCategories,
      brand: proposal.brand,
      aiInfluencer: proposal.aiInfluencer
    });

    await writeStoreConfigFiles(storeSlug, config);
    proposal.status = "approved";
    await saveJsonArray('store-proposals.json', Array.from(storeProposals.values()));
  } finally {
    storeProposalOperations.release(id);
  }

  return {
    ok: true,
    message: "Propozycja sklepu zatwierdzona i konfiguracja utworzona.",
    proposal,
    storeSlug
  };
});

app.post("/agent/stores/proposals/:id/reject", async (request, reply) => {
  const { id } = request.params as { id: string };
  const proposal = storeProposals.get(id);

  if (!proposal) {
    return reply.code(404).send({ ok: false, error: "Propozycja sklepu nie istnieje" });
  }

  if (proposal.status !== "pending") {
    return reply.code(409).send({ ok: false, error: `Propozycja ma już status: ${proposal.status}` });
  }

  if (storeProposalOperations.has(id)) {
    return reply.code(409).send({ ok: false, error: "Ta propozycja jest właśnie przetwarzana" });
  }

  proposal.status = "rejected";
  await saveJsonArray('store-proposals.json', Array.from(storeProposals.values()));

  return {
    ok: true,
    message: "Propozycja sklepu odrzucona.",
    proposal
  };
});

type ProductProposal = {
  id: string;
  title: string;
  category: string;
  subcategory?: string;
  supplierProductId?: string;
  imageUrl?: string;
  productUrl?: string;
  reason: string;
  suggestedPrice?: number;
  supplier?: string;
  supplierCost?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  score?: number;
  minimumAcceptablePrice?: number;
  discountRoom?: number;
  salesStrategy?: string;
  valueAdvantages?: string[];
  isSellable?: boolean;
  storeSlug?: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  approvedAt?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

type CustomerNeed = {
  id: string;
  message: string;
  category?: string;
  budgetMax?: number;
  currency?: string;
  urgency: 'today' | 'few_days' | 'one_two_weeks' | 'browsing';
  neededBy?: string;
  occasion?: 'gift' | 'personal' | 'home' | 'travel' | 'other';
  recipient?: string;
  preferences?: string[];
  status: 'new' | 'searching' | 'matched' | 'offered' | 'purchased' | 'no_match' | 'expired';
  matchedProposalIds?: string[];
  storeSlug?: string;
  createdAt: string;
  updatedAt: string;
};

const customerNeeds = new Map<string, CustomerNeed>(
  (await loadJsonArray<CustomerNeed>('customer-needs.json')).map((item) => [item.id, item])
);

// No search survives a restart, so 'searching' here was interrupted.
for (const need of customerNeeds.values()) {
  if (need.status === 'searching') {
    need.status = 'new';
  }
}

const productProposals = new Map<string, ProductProposal>(
  (await loadJsonArray<ProductProposal>('product-proposals.json')).map((item) => [item.id, item])
);

const productApprovals = new InFlightGuard();

app.post('/agent/products/propose', async (request, reply) => {
  const body = request.body as {
    title?: string;
    category?: string;
    reason?: string;
    suggestedPrice?: number;
    supplier?: string;
    storeSlug?: string;
  } | undefined;

  if (!body?.title || !body.category || !body.reason) {
    return reply.code(400).send({
      error: 'title, category i reason są wymagane'
    });
  }

  if (body.storeSlug !== undefined && !STORE_SLUG_PATTERN.test(body.storeSlug)) {
    return reply.code(400).send({ error: 'Nieprawidłowy storeSlug' });
  }

  if (
    body.suggestedPrice !== undefined &&
    (typeof body.suggestedPrice !== 'number' || !Number.isFinite(body.suggestedPrice) || body.suggestedPrice <= 0)
  ) {
    return reply.code(400).send({ error: 'suggestedPrice musi być liczbą większą od zera' });
  }

  const id = crypto.randomUUID();

  const proposal = {
    id,
    title: body.title,
    category: body.category,
    reason: body.reason,
    suggestedPrice: body.suggestedPrice,
    supplier: body.supplier,
    storeSlug: body.storeSlug ?? DEFAULT_STORE_SLUG,
    status: 'pending' as const,
    createdAt: new Date().toISOString()
  };

  productProposals.set(id, proposal);
  await saveJsonArray('product-proposals.json', Array.from(productProposals.values()));

  return {
    ok: true,
    proposal
  };
});

app.get('/agent/products/proposals', async () => {
  return {
    ok: true,
    proposals: Array.from(productProposals.values())
  };
});


app.post('/agent/products/proposals/:id/approve', async (request, reply) => {
  const { id } = request.params as { id: string };
  const proposal = productProposals.get(id);

  if (!proposal) {
    return reply.code(404).send({
      ok: false,
      error: 'Propozycja nie istnieje'
    });
  }

  if (proposal.status !== 'pending') {
    return reply.code(409).send({
      ok: false,
      error: `Propozycja ma już status: ${proposal.status}`
    });
  }

  const { createShopifyProduct, setShopifyVariantPrice, setShopifyProductInventory } = await import("@dropshipping/shopify");
  const shopifyConfig = getShopifyConfig();
  if (!shopifyConfig) {
    return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
  }

  let store: Awaited<ReturnType<typeof loadStoreConfig>>;

  try {
    store = await loadStoreConfig(proposal.storeSlug ?? DEFAULT_STORE_SLUG);
  } catch (error) {
    return reply.code(400).send({ ok: false, error: publicErrorDetails(error) });
  }

  // Concurrent approvals of the same proposal would each create a Shopify product.
  if (!productApprovals.tryAcquire(id)) {
    return reply.code(409).send({
      ok: false,
      error: 'Zatwierdzanie tej propozycji już trwa'
    });
  }

  const persist = () =>
    saveJsonArray('product-proposals.json', Array.from(productProposals.values()));

  try {
    const outcome = await approveProductProposal(proposal, {
      async createProduct() {
        const created = await createShopifyProduct(shopifyConfig, {
          title: proposal.title,
          description: `Produkt wybrany przez Product Scout. Powód: ${proposal.reason}`,
          ...shopifyProductAttributes(store, proposal)
        });

        return {
          productId: created.product?.id ?? '',
          variantId: created.product?.variants.nodes[0]?.id,
          raw: created
        };
      },
      setPrice: (productId, variantId, price) =>
        setShopifyVariantPrice(shopifyConfig, productId, variantId, price),
      setInventory: (productId) =>
        setShopifyProductInventory(shopifyConfig, productId, 1),
      persist
    });

    const shopify = {
      ...(outcome.created as object | undefined ?? {
        product: { id: proposal.shopifyProductId },
        userErrors: []
      }),
      ...(outcome.priceUpdate ? { priceUpdate: outcome.priceUpdate } : {})
    };

    return {
      ok: true,
      message: outcome.reusedExistingProduct
        ? 'Propozycja zatwierdzona; dokończono konfigurację istniejącego produktu Shopify (bez tworzenia duplikatu).'
        : 'Propozycja zatwierdzona i utworzona w Shopify jako DRAFT.',
      proposal,
      shopify
    };
  } catch (error) {
    return sendUpstreamError(
      request,
      reply,
      proposal.shopifyProductId
        ? 'Produkt został utworzony w Shopify, ale jego konfiguracja nie powiodła się. Ponów zatwierdzenie, aby ją dokończyć bez tworzenia duplikatu.'
        : 'Nie udało się utworzyć produktu w Shopify.',
      error
    );
  } finally {
    productApprovals.release(id);
  }
});

app.post('/agent/products/proposals/:id/reject', async (request, reply) => {
  const { id } = request.params as { id: string };
  const proposal = productProposals.get(id);

  if (!proposal) {
    return reply.code(404).send({
      ok: false,
      error: 'Propozycja nie istnieje'
    });
  }

  if (proposal.status !== 'pending') {
    return reply.code(409).send({
      ok: false,
      error: `Propozycja ma już status: ${proposal.status}`
    });
  }

  if (productApprovals.has(id)) {
    return reply.code(409).send({
      ok: false,
      error: 'Zatwierdzanie tej propozycji już trwa'
    });
  }

  if (proposal.shopifyProductId) {
    return reply.code(409).send({
      ok: false,
      error: `Dla tej propozycji istnieje już produkt Shopify (${proposal.shopifyProductId}). Dokończ zatwierdzenie lub usuń produkt w Shopify.`
    });
  }

  proposal.status = 'rejected';
  await saveJsonArray('product-proposals.json', Array.from(productProposals.values()));

  return {
    ok: true,
    proposal
  };
});

app.get('/suppliers/search', async (request, reply) => {
  const query = request.query as {
    query?: string;
    category?: string;
    maxPrice?: string;
    currency?: string;
    shippingCountry?: string;
    limit?: string;
  };

  const parsed = parseNumberParams(query, ['maxPrice', 'limit']);

  if (!parsed.ok) {
    return reply.code(400).send({ ok: false, error: parsed.error });
  }

  try {
    const { manager, products, supplierErrors } = await searchSuppliers({
      query: query.query,
      category: query.category,
      maxPrice: parsed.numbers.maxPrice,
      currency: query.currency,
      shippingCountry: query.shippingCountry,
      limit: parsed.numbers.limit
    });

    return {
      ok: true,
      suppliers: manager.listSuppliers(),
      count: products.length,
      products,
      supplierErrors
    };
  } catch (error) {
    return sendUpstreamError(request, reply, 'Wyszukiwanie u dostawców nie powiodło się.', error);
  }
});

app.get("/", async (_request, reply) => {
  return reply.type("text/html").send("<h1>Giovetta Living AI</h1><p>API działa poprawnie.</p>");
});

app.get("/shopify/scopes", async (request, reply) => {
  const { createShopifyClient } = await import("@dropshipping/shopify");

  const config = getShopifyConfig();
  if (!config) {
    return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
  }

  const client = createShopifyClient(config);

  try {
    return await client.query(`
      query {
        currentAppInstallation {
          accessScopes {
            handle
            description
          }
        }
      }
    `);
  } catch (error) {
    return sendUpstreamError(request, reply, 'Nie udało się pobrać uprawnień Shopify.', error);
  }
});

app.get("/stores/:slug/config", async (request, reply) => {
  const { slug } = request.params as { slug: string };

  try {
    const store = await loadStoreConfig(slug);
    return { ok: true, store: toPublicStoreConfig(store) };
  } catch (error) {
    return sendStoreConfigError(request, reply, error, 'Nie udało się wczytać konfiguracji sklepu');
  }
});

app.get("/store/config", async (request, reply) => {
  try {
    const store = await loadStoreConfig(DEFAULT_STORE_SLUG);
    return { ok: true, store: toPublicStoreConfig(store) };
  } catch (error) {
    return sendStoreConfigError(request, reply, error, 'Nie udało się wczytać konfiguracji Giovetta Living');
  }
});

app.get('/shopify/test', async (request, reply) => {
  const { createShopifyClient } = await import('@dropshipping/shopify');
  const config = getShopifyConfig();

  if (!config) {
    return reply.code(503).send({
      ok: false,
      error: 'Brakuje konfiguracji Shopify w .env'
    });
  }

  const client = createShopifyClient(config);

  try {
    const data = await client.query<{
      shop: {
        name: string;
        myshopifyDomain: string;
      };
    }>(`
      query {
        shop {
          name
          myshopifyDomain
        }
      }
    `);

    return {
      ok: true,
      shop: data.shop
    };
  } catch (error) {
    return sendUpstreamError(request, reply, 'Połączenie z Shopify nie powiodło się.', error);
  }
});


app.get('/agent/products/evaluate', async (request, reply) => {
  const query = request.query as {
    query?: string;
    category?: string;
    maxPrice?: string;
    shippingCountry?: string;
    limit?: string;
  };

  const parsed = parseNumberParams(query, ['maxPrice', 'limit']);

  if (!parsed.ok) {
    return reply.code(400).send({ ok: false, error: parsed.error });
  }

  const store = await loadStoreForRequest(reply, DEFAULT_STORE_SLUG);

  if (!store) {
    return reply;
  }

  const scoutSettings = productScoutSettings(store);

  let search: Awaited<ReturnType<typeof searchSuppliers>>;

  try {
    search = await searchSuppliers({
      query: query.query,
      category: query.category,
      maxPrice: parsed.numbers.maxPrice,
      shippingCountry: query.shippingCountry,
      limit: parsed.numbers.limit
    });
  } catch (error) {
    return sendUpstreamError(request, reply, 'Wyszukiwanie u dostawców nie powiodło się.', error);
  }

  const evaluations = search.products.map((product) =>
    evaluateProduct(product, scoutSettings.evaluation)
  );

  return {
    ok: true,
    count: evaluations.length,
    evaluations,
    supplierErrors: search.supplierErrors
  };
});


app.post('/agent/products/propose-from-scout', async (request, reply) => {
  const body = request.body as {
    query?: string;
    category?: string;
    maxPrice?: number;
    shippingCountry?: string;
    limit?: number;
    minScore?: number;
    storeSlug?: string;
  } | undefined;

  const parsed = parseNumberParams(body ?? {}, ['maxPrice', 'limit', 'minScore']);

  if (!parsed.ok) {
    return reply.code(400).send({ ok: false, error: parsed.error });
  }

  if (body?.storeSlug !== undefined && !STORE_SLUG_PATTERN.test(body.storeSlug)) {
    return reply.code(400).send({ ok: false, error: 'Nieprawidłowy storeSlug' });
  }

  const store = await loadStoreForRequest(reply, body?.storeSlug ?? DEFAULT_STORE_SLUG);

  if (!store) {
    return reply;
  }

  const scoutSettings = productScoutSettings(store);

  let search: Awaited<ReturnType<typeof searchSuppliers>>;

  try {
    search = await searchSuppliers({
      query: body?.query,
      category: body?.category,
      maxPrice: parsed.numbers.maxPrice,
      shippingCountry: body?.shippingCountry,
      limit: parsed.numbers.limit
    });
  } catch (error) {
    return sendUpstreamError(request, reply, 'Wyszukiwanie u dostawców nie powiodło się.', error);
  }

  const evaluations = search.products
    .map((product) => evaluateProduct(product, scoutSettings.evaluation))
    .sort((a, b) => b.score - a.score);

  const minScore = parsed.numbers.minScore ?? 70;
  const selected = evaluations.find((evaluation) => evaluation.score >= minScore);

  if (!selected) {
    return reply.code(404).send({
      ok: false,
      error: 'Nie znaleziono produktu spełniającego minimalny score.',
      minScore,
      evaluations,
      supplierErrors: search.supplierErrors
    });
  }

  const proposal = {
    id: crypto.randomUUID(),
    title: selected.product.title,
    subcategory: selected.product.subcategory,
    category: selected.product.category ?? 'Other',
    supplierProductId: selected.product.id,
    imageUrl: selected.product.imageUrl,
    productUrl: selected.product.productUrl,
    reason: selected.reasons.join(' '),
    suggestedPrice: selected.suggestedPrice,
    supplier: selected.product.supplier,
    supplierCost: selected.product.price,
    grossProfit: selected.grossProfit,
    grossMarginPercent: selected.grossMarginPercent,
    score: selected.score,
    storeSlug: body?.storeSlug ?? DEFAULT_STORE_SLUG,
    status: 'pending' as const,
    createdAt: new Date().toISOString()
  };

  productProposals.set(proposal.id, proposal);
  await saveJsonArray(
    'product-proposals.json',
    Array.from(productProposals.values())
  );

  return {
    ok: true,
    proposal,
    evaluation: selected,
    supplierErrors: search.supplierErrors
  };
});

app.post('/agent/customer-needs', async (request, reply) => {
  const body = request.body as {
    message?: string;
    category?: string;
    budgetMax?: number;
    currency?: string;
    urgency?: CustomerNeed['urgency'];
    neededBy?: string;
    occasion?: CustomerNeed['occasion'];
    recipient?: string;
    preferences?: string[];
    storeSlug?: string;
  } | undefined;

  if (!body?.message || !body.urgency) {
    return reply.code(400).send({
      error: 'message i urgency są wymagane'
    });
  }

  const allowedUrgencies: CustomerNeed['urgency'][] = [
    'today',
    'few_days',
    'one_two_weeks',
    'browsing'
  ];

  if (!allowedUrgencies.includes(body.urgency)) {
    return reply.code(400).send({
      error: 'Nieprawidłowa wartość urgency'
    });
  }

  if (
    body.budgetMax !== undefined &&
    (typeof body.budgetMax !== 'number' || !Number.isFinite(body.budgetMax) || body.budgetMax <= 0)
  ) {
    return reply.code(400).send({
      error: 'budgetMax musi być liczbą większą od zera'
    });
  }

  let currency: string;

  try {
    currency = normalizeCurrencyCode(body.currency ?? 'PLN');
  } catch {
    return reply.code(400).send({
      error: 'Nieprawidłowy kod waluty'
    });
  }

  if (body.storeSlug !== undefined && !STORE_SLUG_PATTERN.test(body.storeSlug)) {
    return reply.code(400).send({
      error: 'Nieprawidłowy storeSlug'
    });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const need: CustomerNeed = {
    id,
    message: body.message,
    category: body.category,
    budgetMax: body.budgetMax,
    currency,
    urgency: body.urgency,
    neededBy: body.neededBy,
    occasion: body.occasion,
    recipient: body.recipient,
    preferences: body.preferences,
    status: 'new',
    matchedProposalIds: [],
    storeSlug: body.storeSlug ?? DEFAULT_STORE_SLUG,
    createdAt: now,
    updatedAt: now
  };

  customerNeeds.set(id, need);

  await saveJsonArray(
    'customer-needs.json',
    Array.from(customerNeeds.values())
  );

  return {
    ok: true,
    need
  };
});

app.get('/agent/customer-needs', async () => {
  return {
    ok: true,
    count: customerNeeds.size,
    needs: Array.from(customerNeeds.values())
  };
});

const customerNeedSearches = new InFlightGuard();

app.post('/agent/customer-needs/:id/search', async (request, reply) => {
  const { id } = request.params as { id: string };

  const need = customerNeeds.get(id);

  if (!need) {
    return reply.code(404).send({
      error: 'Nie znaleziono potrzeby klienta'
    });
  }

  if (need.status === 'purchased' || need.status === 'expired') {
    return reply.code(409).send({
      error: `Nie można wyszukiwać dla potrzeby ze statusem ${need.status}`
    });
  }

  const store = await loadStoreForRequest(reply, need.storeSlug ?? DEFAULT_STORE_SLUG);

  if (!store) {
    return reply;
  }

  // A second search while one is running would race on status and proposals.
  if (!customerNeedSearches.tryAcquire(id)) {
    return reply.code(409).send({
      error: 'Wyszukiwanie dla tej potrzeby już trwa'
    });
  }

  // A persisted 'searching' without an active search is left over from a
  // crash; it is recoverable and reverts to 'new' on failure.
  const statusBeforeSearch = need.status === 'searching' ? 'new' : need.status;

  try {
    return await runCustomerNeedSearch(need, store, request.log);
  } catch (error) {
    need.status = statusBeforeSearch;
    need.updatedAt = new Date().toISOString();

    await saveJsonArray(
      'customer-needs.json',
      Array.from(customerNeeds.values())
    );

    return sendUpstreamError(
      request,
      reply,
      `Wyszukiwanie nie powiodło się; przywrócono status ${need.status}.`,
      error
    );
  } finally {
    customerNeedSearches.release(id);
  }
});

async function runCustomerNeedSearch(
  need: CustomerNeed,
  store: StoreConfig,
  log: FastifyRequest['log']
) {
  const scoutSettings = productScoutSettings(store);

  need.status = 'searching';
  need.updatedAt = new Date().toISOString();

  await saveJsonArray(
    'customer-needs.json',
    Array.from(customerNeeds.values())
  );

  const { products, supplierErrors } = await searchSuppliers({
    category: need.category,
    shippingCountry: 'PL',
    limit: 10
  });

  const exchangeRateProvider = new FrankfurterExchangeRateProvider();
  const customerCurrency = need.currency ?? 'PLN';

  const evaluations = [];
  const skippedProducts: Array<{ supplier: string; id: string; reason: string }> = [];

  for (const product of products) {
    const evaluation = evaluateProduct(product, scoutSettings.evaluation);

    let recommendedPriceInCustomerCurrency = evaluation.suggestedPrice;

    if (need.budgetMax !== undefined) {
      try {
        recommendedPriceInCustomerCurrency = await convertCurrency(
          evaluation.suggestedPrice,
          product.currency,
          customerCurrency,
          exchangeRateProvider
        );
      } catch (error) {
        // One product with an unconvertible price must not abort the search.
        log.warn({ err: error, productId: product.id }, 'currency conversion failed');
        skippedProducts.push({
          supplier: product.supplier,
          id: product.id,
          reason: publicErrorDetails(error)
        });
        continue;
      }
    }

    if (
      need.budgetMax !== undefined &&
      recommendedPriceInCustomerCurrency > need.budgetMax
    ) {
      continue;
    }

    const salesOpportunity = createSalesOpportunity(product, scoutSettings.salesOpportunity);

    evaluations.push({
      ...evaluation,
      salesOpportunity,
      recommendedPriceInCustomerCurrency
    });
  }

  evaluations.sort((a, b) => {
    if (a.salesOpportunity.isSellable !== b.salesOpportunity.isSellable) {
      return a.salesOpportunity.isSellable ? -1 : 1;
    }

    return b.score - a.score;
  });

  const maxDeliveryDaysByUrgency: Record<CustomerNeed['urgency'], number | undefined> = {
    today: 1,
    few_days: 3,
    one_two_weeks: 14,
    browsing: undefined
  };

  const maxDeliveryDays = maxDeliveryDaysByUrgency[need.urgency];

  const selected = evaluations
    .filter((evaluation) => {
      if (maxDeliveryDays === undefined) {
        return true;
      }

      const deliveryDays = evaluation.product.estimatedDeliveryDays;

      return deliveryDays === undefined || deliveryDays <= maxDeliveryDays;
    })
    .slice(0, 3);

  // Without any match, skipped products mean the result is unreliable
  // (e.g. exchange rates unavailable), so this is an error, not 'no_match'.
  if (selected.length === 0 && skippedProducts.length > 0) {
    throw new Error(
      `Nie udało się ocenić ${skippedProducts.length} produktów: ${skippedProducts[0].reason}`
    );
  }

  if (selected.length === 0) {
    need.status = 'no_match';
    need.updatedAt = new Date().toISOString();

    await saveJsonArray(
      'customer-needs.json',
      Array.from(customerNeeds.values())
    );

    return {
      ok: true,
      status: 'no_match',
      need,
      matches: [],
      supplierErrors
    };
  }

  const proposalIds: string[] = [];

  for (const evaluation of selected) {
    const proposal: ProductProposal = {
      id: crypto.randomUUID(),
      title: evaluation.product.title,
      category: evaluation.product.category ?? need.category ?? 'Other',
      supplierProductId: evaluation.product.id,
      imageUrl: evaluation.product.imageUrl,
      productUrl: evaluation.product.productUrl,
      reason: [
        `Dopasowanie do potrzeby klienta: ${need.message}.`,
        ...evaluation.reasons
      ].join(' '),
      suggestedPrice: evaluation.suggestedPrice,
      supplier: evaluation.product.supplier,
      supplierCost: evaluation.product.price,
      grossProfit: evaluation.grossProfit,
      grossMarginPercent: evaluation.grossMarginPercent,
      score: evaluation.score,
      minimumAcceptablePrice: evaluation.salesOpportunity.minimumAcceptablePrice,
      discountRoom: evaluation.salesOpportunity.discountRoom,
      salesStrategy: evaluation.salesOpportunity.salesStrategy,
      valueAdvantages: evaluation.salesOpportunity.valueAdvantages,
      isSellable: evaluation.salesOpportunity.isSellable,
      storeSlug: need.storeSlug ?? DEFAULT_STORE_SLUG,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    productProposals.set(proposal.id, proposal);
    proposalIds.push(proposal.id);
  }

  await saveJsonArray(
    'product-proposals.json',
    Array.from(productProposals.values())
  );

  need.status = 'matched';
  need.matchedProposalIds = proposalIds;
  need.updatedAt = new Date().toISOString();

  await saveJsonArray(
    'customer-needs.json',
    Array.from(customerNeeds.values())
  );

  return {
    ok: true,
    status: 'matched',
    need,
    matches: selected.map((evaluation, index) => ({
      proposalId: proposalIds[index],
      evaluation
    })),
    skippedProducts,
    supplierErrors
  };
}
