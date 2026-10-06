import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: resolve(__dirname, '../../../.env'),
  override: true
});

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { askClaude } from '@dropshipping/ai';
import { createStoreConfig, type StoreProposal } from '@dropshipping/stores';
import { loadJsonArray, saveJsonArray } from './storage.js';
import { findAvailableStoreSlug, loadStoreConfig, writeStoreConfigFiles } from './store-files.js';
import { getShopifyConfig } from './shopify-config.js';
import {
  evaluateProduct,
  createSalesOpportunity,
  analyzeCompetition,
  convertCurrency,
  FrankfurterExchangeRateProvider,
  evaluateCatalogCoverage,
  countProductsBySubcategory
} from '@dropshipping/product-scout';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
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

  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);

  return reply.redirect(authorizationUrl.toString());
});
app.get('/allegro/oauth/callback', async (request, reply) => {
  const query = request.query as {
    code?: string;
    error?: string;
    error_description?: string;
  };

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

  const tokenResponse = await fetch(
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
      })
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    return reply.code(tokenResponse.status).send({
      error: 'Allegro token exchange failed',
      details: tokenData
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
  return { response: await askClaude(body.prompt) };
});


app.get('/shopify/products', async () => {
  const { createShopifyClient } = await import('@dropshipping/shopify');

  const store = await loadStoreConfig('giovetta-living');
  const config = getShopifyConfig();

  if (!config) {
    return { ok: false, error: 'Brakuje konfiguracji Shopify w .env' };
  }

  const client = createShopifyClient(config);

  const data = await client.query<{
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
  }>(`
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

  const products = data.products.edges
    .map(({ node }) => node)
    .filter((product) => {
      if (product.id.endsWith('16121646285134')) {
        console.log('SHOPIFY_DIAGNOSTIC', JSON.stringify({
          id: product.id,
          title: product.title,
          vendor: product.vendor,
          productType: product.productType,
          tags: product.tags,
          totalInventory: product.totalInventory,
          variants: product.variants.nodes
        }));
      }

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

  if (productId !== '16121646285134') {
    return reply.code(400).send({
      ok: false,
      error: 'Ten tymczasowy endpoint jest ograniczony do zatwierdzonego produktu testowego.'
    });
  }

  const { tagShopifyProduct, setShopifyProductInventory } = await import('@dropshipping/shopify');
  const shopifyConfig = getShopifyConfig();

  if (!shopifyConfig) {
    return reply.code(503).send({
      ok: false,
      error: 'Brakuje konfiguracji Shopify w .env'
    });
  }

  await tagShopifyProduct(shopifyConfig, `gid://shopify/Product/${productId}`, ['giovetta']);
  await setShopifyProductInventory(
    shopifyConfig,
    `gid://shopify/Product/${productId}`,
    1
  );

  return {
    ok: true,
    message: 'Istniejący produkt testowy został przygotowany do katalogu.',
    productId
  };
});

app.get('/shopify/product-diagnostic', async () => {
  const { createShopifyClient } = await import('@dropshipping/shopify');
  const config = getShopifyConfig();

  if (!config) {
    return { ok: false, error: 'Brakuje konfiguracji Shopify w .env' };
  }

  const client = createShopifyClient(config);

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
    query {
      product(id: "gid://shopify/Product/16121646285134") {
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
  `);

  return { ok: true, product: data.product };
});

app.get('/catalog/coverage', async (_request, reply) => {
  try {
    const store = await loadStoreConfig('giovetta-living');

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
      return reply.code(502).send({
        ok: false,
        error: 'Nie udało się pobrać produktów Shopify.',
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

app.post("/agent/stores/propose", async (request, reply) => {
  const body = request.body as {
    name: string;
    tagline: string;
    niche: string;
    productCategories: string[];
    brand: { primaryColor?: string; secondaryColor?: string; style?: string };
    aiInfluencer: { enabled: boolean; name?: string; ageRange?: string; personality?: string[] };
    reason: string;
  };

  const proposal = {
    id: crypto.randomUUID(),
    ...body,
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

  const storeSlug = await findAvailableStoreSlug(proposal.name);
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

const productProposals = new Map<string, ProductProposal>(
  (await loadJsonArray<ProductProposal>('product-proposals.json')).map((item) => [item.id, item])
);

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

  const id = crypto.randomUUID();

  const proposal = {
    id,
    title: body.title,
    category: body.category,
    reason: body.reason,
    suggestedPrice: body.suggestedPrice,
    supplier: body.supplier,
    storeSlug: body.storeSlug ?? 'giovetta-living',
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

  const { createShopifyProduct, tagShopifyProduct, setShopifyProductInventory } = await import("@dropshipping/shopify");
  const shopifyConfig = getShopifyConfig();
  if (!shopifyConfig) {
    return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
  }

  const store = await loadStoreConfig(proposal.storeSlug ?? 'giovetta-living');

  const result = await createShopifyProduct(
    shopifyConfig,
    {
      title: proposal.title,
      description: `Produkt wybrany przez Product Scout. Powód: ${proposal.reason}`,
      vendor: store.name,
      productType: proposal.category,
      price: proposal.suggestedPrice
    }
  );

  if (result.product?.id) {
    await setShopifyProductInventory(shopifyConfig, result.product.id, 1);
  }

  proposal.status = 'approved';
  await saveJsonArray('product-proposals.json', Array.from(productProposals.values()));

  return {
    ok: true,
    message: 'Propozycja zatwierdzona i utworzona w Shopify jako DRAFT.',
    proposal,
    shopify: result
  };
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

  proposal.status = 'rejected';
  await saveJsonArray('product-proposals.json', Array.from(productProposals.values()));

  return {
    ok: true,
    proposal
  };
});

app.get('/suppliers/search', async (request) => {
  const { createSupplierManager } = await import('./suppliers.js');
  const query = request.query as {
    query?: string;
    category?: string;
    maxPrice?: string;
    currency?: string;
    shippingCountry?: string;
    limit?: string;
  };

  const manager = createSupplierManager();

  const products = await manager.searchProducts({
    query: query.query,
    category: query.category,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
    currency: query.currency,
    shippingCountry: query.shippingCountry,
    limit: query.limit ? Number(query.limit) : undefined
  });

  return {
    ok: true,
    suppliers: manager.listSuppliers(),
    count: products.length,
    products
  };
});

app.get("/", async (_request, reply) => {
  return reply.type("text/html").send("<h1>Giovetta Living AI</h1><p>API działa poprawnie.</p>");
});

app.get("/shopify/scopes", async () => {
  const { createShopifyClient } = await import("@dropshipping/shopify");

  const config = getShopifyConfig();
  if (!config) {
    return { ok: false, error: 'Brakuje konfiguracji Shopify w .env' };
  }

  const client = createShopifyClient(config);

  return client.query(`
    query {
      currentAppInstallation {
        accessScopes {
          handle
          description
        }
      }
    }
  `);
});

app.get("/stores/:slug/config", async (request, reply) => {
  const { slug } = request.params as { slug: string };

  try {
    const store = await loadStoreConfig(slug);
    return { ok: true, store };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udało się wczytać konfiguracji sklepu';
    return reply.code(404).send({ ok: false, error: message });
  }
});

app.get("/store/config", async (_request, reply) => {
  try {
    const store = await loadStoreConfig('giovetta-living');
    return { ok: true, store };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udało się wczytać konfiguracji Giovetta Living';
    return reply.code(404).send({ ok: false, error: message });
  }
});

const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? '0.0.0.0';
app.get('/shopify/test', async () => {
  const { createShopifyClient } = await import('@dropshipping/shopify');
  const config = getShopifyConfig();

  if (!config) {
    return {
      ok: false,
      error: 'Brakuje konfiguracji Shopify w .env'
    };
  }

  const client = createShopifyClient(config);

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
});


app.get('/agent/products/evaluate', async (request) => {
  const { createSupplierManager } = await import('./suppliers.js');
  const {
    evaluateProduct,
    createSalesOpportunity,
    convertCurrency,
    FrankfurterExchangeRateProvider
  } = await import('@dropshipping/product-scout');

  const query = request.query as {
    query?: string;
    category?: string;
    maxPrice?: string;
    shippingCountry?: string;
    limit?: string;
  };

  const manager = createSupplierManager();

  const products = await manager.searchProducts({
    query: query.query,
    category: query.category,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
    shippingCountry: query.shippingCountry,
    limit: query.limit ? Number(query.limit) : undefined
  });

  const evaluations = products.map((product) =>
    evaluateProduct(product)
  );

  return {
    ok: true,
    count: evaluations.length,
    evaluations
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

  const { createSupplierManager } = await import('./suppliers.js');
  const {
    evaluateProduct,
    createSalesOpportunity,
    convertCurrency,
    FrankfurterExchangeRateProvider
  } = await import('@dropshipping/product-scout');

  const manager = createSupplierManager();

  const products = await manager.searchProducts({
    query: body?.query,
    category: body?.category,
    maxPrice: body?.maxPrice,
    shippingCountry: body?.shippingCountry,
    limit: body?.limit
  });

  const evaluations = products
    .map((product) => evaluateProduct(product))
    .sort((a, b) => b.score - a.score);

  const minScore = body?.minScore ?? 70;
  const selected = evaluations.find((evaluation) => evaluation.score >= minScore);

  if (!selected) {
    return reply.code(404).send({
      ok: false,
      error: 'Nie znaleziono produktu spełniającego minimalny score.',
      minScore,
      evaluations
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
    storeSlug: body?.storeSlug ?? 'giovetta-living',
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
    evaluation: selected
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

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const need: CustomerNeed = {
    id,
    message: body.message,
    category: body.category,
    budgetMax: body.budgetMax,
    currency: body.currency ?? 'PLN',
    urgency: body.urgency,
    neededBy: body.neededBy,
    occasion: body.occasion,
    recipient: body.recipient,
    preferences: body.preferences,
    status: 'new',
    matchedProposalIds: [],
    storeSlug: body.storeSlug ?? 'giovetta-living',
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

  const { createSupplierManager } = await import('./suppliers.js');
  const { evaluateProduct } = await import('@dropshipping/product-scout');

  need.status = 'searching';
  need.updatedAt = new Date().toISOString();

  await saveJsonArray(
    'customer-needs.json',
    Array.from(customerNeeds.values())
  );

  const manager = createSupplierManager();

  const products = await manager.searchProducts({
    category: need.category,
    shippingCountry: 'PL',
    limit: 10
  });

  const exchangeRateProvider = new FrankfurterExchangeRateProvider();

  const evaluations = [];

  for (const product of products) {
    const evaluation = evaluateProduct(product);

    let recommendedPriceInCustomerCurrency = evaluation.suggestedPrice;

    if (
      need.budgetMax !== undefined &&
      product.currency !== (need.currency ?? 'PLN')
    ) {
      recommendedPriceInCustomerCurrency = await convertCurrency(
        evaluation.suggestedPrice,
        product.currency,
        need.currency ?? 'PLN',
        exchangeRateProvider
      );
    }

    if (
      need.budgetMax !== undefined &&
      recommendedPriceInCustomerCurrency > need.budgetMax
    ) {
      continue;
    }

    const salesOpportunity = createSalesOpportunity(product);

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
      matches: []
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
      storeSlug: need.storeSlug ?? 'giovetta-living',
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
    }))
  };
});

await app.listen({ port, host });
