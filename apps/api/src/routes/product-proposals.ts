import type { FastifyInstance } from 'fastify';
import { publicErrorDetails, STORE_SLUG_PATTERN } from '../security.js';
import { saveJsonArray } from '../storage.js';
import { getShopifyConfig } from '../shopify-config.js';
import { loadStoreConfig } from '../store-files.js';
import { approveProductProposal, type InFlightGuard } from '../product-approval.js';
import { shopifyProductAttributes } from '../store-settings.js';
import { sendUpstreamError } from '../http-helpers.js';
import type { ProductProposal } from '../state.js';

export type ProductProposalRouteDependencies = {
  // Shared instances from state.ts; customer needs and propose-from-scout use the same ones.
  productProposals: Map<string, ProductProposal>;
  productApprovals: InFlightGuard;
  // Resolved by app.ts after .env is loaded.
  defaultStoreSlug: string;
};

export function registerProductProposalRoutes(
  app: FastifyInstance,
  { productProposals, productApprovals, defaultStoreSlug }: ProductProposalRouteDependencies
) {
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
      storeSlug: body.storeSlug ?? defaultStoreSlug,
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
      store = await loadStoreConfig(proposal.storeSlug ?? defaultStoreSlug);
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
}
