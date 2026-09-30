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

  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    return { ok: false, error: 'Brakuje konfiguracji Shopify w .env' };
  }

  const client = createShopifyClient({
    shopDomain: shop,
    clientId,
    clientSecret
  });

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


const productProposals = new Map<string, {
  id: string;
  title: string;
  category: string;
  reason: string;
  suggestedPrice?: number;
  supplier?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}>();

app.post('/agent/products/propose', async (request, reply) => {
  const body = request.body as {
    title?: string;
    category?: string;
    reason?: string;
    suggestedPrice?: number;
    supplier?: string;
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
    status: 'pending' as const,
    createdAt: new Date().toISOString()
  };

  productProposals.set(id, proposal);

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

  proposal.status = 'approved';

  return {
    ok: true,
    message: 'Propozycja zatwierdzona. Wykonanie akcji Shopify będzie dodane w kolejnym kroku.',
    proposal
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

  return {
    ok: true,
    proposal
  };
});

const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? '0.0.0.0';
app.get('/shopify/test', async () => {
  const { createShopifyClient } = await import('@dropshipping/shopify');

  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    return {
      ok: false,
      error: 'Brakuje konfiguracji Shopify w .env'
    };
  }

  const client = createShopifyClient({
    shopDomain: shop,
    clientId,
    clientSecret
  });

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
await app.listen({ port, host });

