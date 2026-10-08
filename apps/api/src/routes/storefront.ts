import type { FastifyInstance } from 'fastify';
import { createShopifyCart, createShopifyClient, type StorefrontCartLine } from '@dropshipping/shopify';
import { getShopifyConfig, getShopifyStorefrontConfig } from '../shopify-config.js';
import { loadStoreConfig } from '../store-files.js';
import { sendStoreConfigError } from '../http-helpers.js';
import {
  CATALOG_CART_VARIANTS_QUERY,
  isPurchasableCatalogVariant,
  type ShopifyCartVariant,
  type ShopifyCartVariantsResult
} from '../catalog-model.js';

const MAX_LINES = 10;
const MAX_QUANTITY = 10;

const CART_ERROR = 'Nie udało się utworzyć koszyka Shopify.';
const UNAVAILABLE_VARIANT_ERROR = 'Wybrany wariant jest niedostępny.';

export type StorefrontRouteDependencies = {
  // Resolved by app.ts after .env is loaded.
  defaultStoreSlug: string;
};

function parseLines(value: unknown): { ok: true; lines: StorefrontCartLine[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LINES) {
    return { ok: false, error: `lines musi zawierać 1–${MAX_LINES} pozycji.` };
  }

  const lines: StorefrontCartLine[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Każda pozycja koszyka musi być obiektem.' };
    }

    const merchandiseId = (item as { merchandiseId?: unknown }).merchandiseId;
    const quantity = (item as { quantity?: unknown }).quantity;

    if (
      typeof merchandiseId !== 'string' ||
      !/^gid:\/\/shopify\/ProductVariant\/[A-Za-z0-9_-]+$/.test(merchandiseId)
    ) {
      return { ok: false, error: 'Nieprawidłowy merchandiseId.' };
    }

    if (seen.has(merchandiseId)) {
      return { ok: false, error: 'Każdy wariant może wystąpić w koszyku tylko raz.' };
    }

    seen.add(merchandiseId);

    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      return { ok: false, error: `quantity musi być liczbą całkowitą 1–${MAX_QUANTITY}.` };
    }

    lines.push({ merchandiseId, quantity });
  }

  return { ok: true, lines };
}

export function registerStorefrontRoutes(
  app: FastifyInstance,
  { defaultStoreSlug }: StorefrontRouteDependencies
) {
  app.post('/storefront/cart', async (request, reply) => {
    const parsed = parseLines((request.body as { lines?: unknown } | null)?.lines);

    if (!parsed.ok) {
      return reply.code(400).send({ ok: false, error: parsed.error });
    }

    const config = getShopifyStorefrontConfig();

    if (!config) {
      return reply.code(503).send({
        ok: false,
        error: 'Brakuje konfiguracji Shopify Storefront API w .env'
      });
    }

    // Only variants of products in the public Giovetta catalog may be bought.
    const adminConfig = getShopifyConfig();

    if (!adminConfig) {
      return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
    }

    let store: Awaited<ReturnType<typeof loadStoreConfig>>;

    try {
      store = await loadStoreConfig(defaultStoreSlug);
    } catch (error) {
      return sendStoreConfigError(request, reply, error, 'Nie udało się wczytać konfiguracji sklepu');
    }

    let variants: Map<string, ShopifyCartVariant>;

    try {
      const data = await createShopifyClient(adminConfig).query<ShopifyCartVariantsResult>(
        CATALOG_CART_VARIANTS_QUERY,
        { ids: parsed.lines.map((line) => line.merchandiseId) }
      );

      variants = new Map(
        data.nodes
          .filter((node): node is ShopifyCartVariant & { id: string } => typeof node?.id === 'string')
          .map((node) => [node.id, node])
      );
    } catch (error) {
      // Public endpoint: Shopify/GraphQL details stay in the server log only.
      request.log.error(error);
      return reply.code(502).send({ ok: false, error: CART_ERROR });
    }

    if (!parsed.lines.every((line) => isPurchasableCatalogVariant(variants.get(line.merchandiseId), store))) {
      return reply.code(400).send({ ok: false, error: UNAVAILABLE_VARIANT_ERROR });
    }

    try {
      const cart = await createShopifyCart(config, parsed.lines);

      return {
        ok: true,
        cartId: cart.cartId,
        checkoutUrl: cart.checkoutUrl
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({
        ok: false,
        error: CART_ERROR
      });
    }
  });
}
