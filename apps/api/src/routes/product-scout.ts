import type { FastifyInstance } from 'fastify';
import { evaluateProduct } from '@dropshipping/product-scout';
import { STORE_SLUG_PATTERN } from '../security.js';
import { saveJsonArray } from '../storage.js';
import { productScoutSettings } from '../store-settings.js';
import { loadStoreForRequest, parseNumberParams, sendUpstreamError } from '../http-helpers.js';
import { searchSuppliers } from '../supplier-search.js';
import type { ProductProposal } from '../state.js';

export type ProductScoutRouteDependencies = {
  // Shared instance from state.ts; product proposal and customer need routes use the same one.
  productProposals: Map<string, ProductProposal>;
  // Resolved by app.ts after .env is loaded.
  defaultStoreSlug: string;
};

export function registerProductScoutRoutes(
  app: FastifyInstance,
  { productProposals, defaultStoreSlug }: ProductScoutRouteDependencies
) {
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

    const store = await loadStoreForRequest(reply, defaultStoreSlug);

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

    const store = await loadStoreForRequest(reply, body?.storeSlug ?? defaultStoreSlug);

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
      storeSlug: body?.storeSlug ?? defaultStoreSlug,
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
}
