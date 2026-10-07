import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import {
  type StoreProposal
} from '@dropshipping/stores';
import { loadJsonArray, saveJsonArray } from './storage.js';
import {
  evaluateProduct,
  analyzeCompetition
} from '@dropshipping/product-scout';
import {
  STORE_SLUG_PATTERN,
  publicErrorDetails,
  redactUrlForLogs,
  registerAdminAuth,
  resolveCorsOrigins
} from './security.js';
import { OAuthStateStore } from './allegro-oauth.js';
import {
  InFlightGuard
} from './product-approval.js';
import {
  productScoutSettings,
  resolveDefaultStoreSlug
} from './store-settings.js';
import {
  loadStoreForRequest,
  parseNumberParams,
  sendUpstreamError
} from './http-helpers.js';
import { searchSuppliers } from './supplier-search.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerStoreConfigRoutes } from './routes/store-config.js';
import { registerAllegroRoutes } from './routes/allegro.js';
import { registerShopifyRoutes } from './routes/shopify.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerSupplierRoutes } from './routes/suppliers.js';
import { registerStoreProposalRoutes } from './routes/store-proposals.js';
import { registerProductProposalRoutes } from './routes/product-proposals.js';
import { registerCustomerNeedRoutes } from './routes/customer-needs.js';
import {
  customerNeedSearches,
  customerNeeds,
  productApprovals,
  productProposals
} from './state.js';

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

registerAllegroRoutes(app, { allegroStates, isSecureCookie });

registerSystemRoutes(app);

registerAiRoutes(app);


registerShopifyRoutes(app, { defaultStoreSlug: DEFAULT_STORE_SLUG });

registerCatalogRoutes(app, { defaultStoreSlug: DEFAULT_STORE_SLUG });

const storeProposals = new Map<string, StoreProposal>(
  (await loadJsonArray<StoreProposal>('store-proposals.json')).map((item) => [item.id, item])
);

const storeProposalOperations = new InFlightGuard();

registerStoreProposalRoutes(app, { storeProposals, storeProposalOperations });

registerProductProposalRoutes(app, {
  productProposals,
  productApprovals,
  defaultStoreSlug: DEFAULT_STORE_SLUG
});

registerSupplierRoutes(app);

registerStoreConfigRoutes(app, { defaultStoreSlug: DEFAULT_STORE_SLUG });

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

registerCustomerNeedRoutes(app, {
  customerNeeds,
  customerNeedSearches,
  productProposals,
  defaultStoreSlug: DEFAULT_STORE_SLUG
});
