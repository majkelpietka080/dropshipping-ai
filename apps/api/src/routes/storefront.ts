import type { FastifyInstance } from 'fastify';
import { createShopifyCart, type StorefrontCartLine } from '@dropshipping/shopify';
import { getShopifyStorefrontConfig } from '../shopify-config.js';

const MAX_LINES = 100;
const MAX_QUANTITY = 99;

function parseLines(value: unknown): { ok: true; lines: StorefrontCartLine[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LINES) {
    return { ok: false, error: `lines musi zawierać 1–${MAX_LINES} pozycji.` };
  }

  const lines: StorefrontCartLine[] = [];

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

export function registerStorefrontRoutes(app: FastifyInstance) {
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
        error: 'Nie udało się utworzyć koszyka Shopify.'
      });
    }
  });
}
