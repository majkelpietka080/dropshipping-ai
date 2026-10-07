import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { StoreConfig } from '@dropshipping/stores';
import {
  evaluateProduct,
  createSalesOpportunity,
  convertCurrency,
  normalizeCurrencyCode,
  FrankfurterExchangeRateProvider
} from '@dropshipping/product-scout';
import { publicErrorDetails, STORE_SLUG_PATTERN } from '../security.js';
import { saveJsonArray } from '../storage.js';
import type { InFlightGuard } from '../product-approval.js';
import { productScoutSettings } from '../store-settings.js';
import { loadStoreForRequest, sendUpstreamError } from '../http-helpers.js';
import { searchSuppliers } from '../supplier-search.js';
import type { CustomerNeed, ProductProposal } from '../state.js';

export type CustomerNeedRouteDependencies = {
  // Shared instances from state.ts; productProposals is also used by product proposal routes.
  customerNeeds: Map<string, CustomerNeed>;
  customerNeedSearches: InFlightGuard;
  productProposals: Map<string, ProductProposal>;
  // Resolved by app.ts after .env is loaded.
  defaultStoreSlug: string;
};

export function registerCustomerNeedRoutes(
  app: FastifyInstance,
  { customerNeeds, customerNeedSearches, productProposals, defaultStoreSlug }: CustomerNeedRouteDependencies
) {
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
      storeSlug: body.storeSlug ?? defaultStoreSlug,
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

    const store = await loadStoreForRequest(reply, need.storeSlug ?? defaultStoreSlug);

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
        storeSlug: need.storeSlug ?? defaultStoreSlug,
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
}
