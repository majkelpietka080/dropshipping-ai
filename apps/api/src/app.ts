import Fastify, { type FastifyError, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import {
  createStoreConfig,
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
  FrankfurterExchangeRateProvider
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
  InFlightGuard,
  approveProductProposal
} from './product-approval.js';
import {
  productScoutSettings,
  resolveDefaultStoreSlug,
  shopifyProductAttributes
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
import {
  customerNeedSearches,
  customerNeeds,
  productApprovals,
  productProposals,
  type CustomerNeed,
  type ProductProposal
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
