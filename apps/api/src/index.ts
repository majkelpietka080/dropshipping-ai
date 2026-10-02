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

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true, service: 'dropshipping-ai-api' }));

app.post('/ai/test', async (request, reply) => {
  const body = request.body as { prompt?: string } | undefined;
  if (!body?.prompt) return reply.code(400).send({ error: 'prompt is required' });
  return { response: await askClaude(body.prompt) };
});


app.get('/shopify/products', async () => {
  const { createShopifyClient } = await import('@dropshipping/shopify');

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
          totalInventory: number;
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
            totalInventory
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `);

  return {
    ok: true,
    products: data.products.edges.map(({ node }) => node),
    hasNextPage: data.products.pageInfo.hasNextPage
  };
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
  reason: string;
  suggestedPrice?: number;
  supplier?: string;
  storeSlug?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

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

  const { createShopifyProduct } = await import("@dropshipping/shopify");
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
  const { evaluateProduct } = await import('@dropshipping/product-scout');

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

await app.listen({ port, host });
