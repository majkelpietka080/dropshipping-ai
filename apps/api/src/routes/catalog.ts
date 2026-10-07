import type { FastifyInstance } from 'fastify';
import { countProductsBySubcategory, evaluateCatalogCoverage } from '@dropshipping/product-scout';
import { loadStoreConfig } from '../store-files.js';
import { getShopifyConfig } from '../shopify-config.js';
import { sendStoreConfigError } from '../http-helpers.js';
import {
  CATALOG_PRODUCTS_QUERY,
  CATALOG_PRODUCTS_SEARCH,
  parseCatalogPageParams,
  toCatalogPage,
  type ShopifyCatalogPage
} from '../catalog-model.js';

export type CatalogRouteDependencies = {
  // Resolved by app.ts after .env is loaded.
  defaultStoreSlug: string;
};

// /catalog/coverage reads /shopify/products through app.inject, so it goes
// through the same hooks as an external request.
export function registerCatalogRoutes(
  app: FastifyInstance,
  { defaultStoreSlug }: CatalogRouteDependencies
) {
  app.get('/catalog/coverage', async (_request, reply) => {
    try {
      const store = await loadStoreConfig(defaultStoreSlug);

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
        const upstream = shopifyResponse.json() as { error?: string };

        return reply.code(shopifyResponse.statusCode === 503 ? 503 : 502).send({
          ok: false,
          error: upstream.error ?? 'Nie udało się pobrać produktów Shopify.',
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

  // Public storefront catalog: active Giovetta products only, no internal fields.
  app.get('/catalog/products', async (request, reply) => {
    const params = parseCatalogPageParams(request.query as { limit?: unknown; after?: unknown });

    if (!params.ok) {
      return reply.code(400).send({ ok: false, error: params.error });
    }

    let store: Awaited<ReturnType<typeof loadStoreConfig>>;

    try {
      store = await loadStoreConfig(defaultStoreSlug);
    } catch (error) {
      return sendStoreConfigError(request, reply, error, 'Nie udało się wczytać konfiguracji sklepu');
    }

    const config = getShopifyConfig();

    if (!config) {
      return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
    }

    const { createShopifyClient } = await import('@dropshipping/shopify');

    let data: ShopifyCatalogPage;

    try {
      data = await createShopifyClient(config).query<ShopifyCatalogPage>(CATALOG_PRODUCTS_QUERY, {
        first: params.first,
        after: params.after,
        query: CATALOG_PRODUCTS_SEARCH
      });
    } catch (error) {
      // Public endpoint: Shopify/GraphQL details stay in the server log only.
      request.log.error(error);
      return reply.code(502).send({ ok: false, error: 'Nie udało się pobrać katalogu produktów.' });
    }

    return { ok: true, ...toCatalogPage(data, store) };
  });
}
