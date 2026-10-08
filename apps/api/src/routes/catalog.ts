import type { FastifyInstance } from 'fastify';
import { countProductsBySubcategory, evaluateCatalogCoverage } from '@dropshipping/product-scout';
import { buildCatalogTaxonomy, classifyProductType } from '@dropshipping/stores';
import { loadStoreConfig } from '../store-files.js';
import { getShopifyConfig } from '../shopify-config.js';
import { sendStoreConfigError } from '../http-helpers.js';
import {
  CATALOG_PRODUCT_QUERY,
  CATALOG_PRODUCTS_QUERY,
  CATALOG_PRODUCTS_SEARCH,
  parseCatalogHandle,
  parseCatalogPageParams,
  toCatalogPage,
  toCatalogProductDetail,
  type ShopifyCatalogPage,
  type ShopifyCatalogProductResult
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

      // Same classification as GET /catalog/products: subcategory → category → none.
      const taxonomy = buildCatalogTaxonomy(store);
      const classified = shopifyData.products.map((product) => ({
        productType: product.productType ?? '',
        classification: classifyProductType(product.productType, taxonomy)
      }));

      const productsBySubcategory = countProductsBySubcategory(
        classified.map(({ classification }) => ({ subcategory: classification.subcategory ?? undefined }))
      );
      const coverage = evaluateCatalogCoverage(
        store.catalogCoverage,
        productsBySubcategory
      );

      const unknownCounts = new Map<string, number>();

      for (const { productType, classification } of classified) {
        if (classification.matchedBy === 'none') {
          unknownCounts.set(productType, (unknownCounts.get(productType) ?? 0) + 1);
        }
      }

      return {
        ok: true,
        productsCount: classified.length,
        productsBySubcategory,
        coverage,
        categoryOnlyCount: classified.filter(({ classification }) => classification.matchedBy === 'category').length,
        unclassifiedCount: classified.filter(({ classification }) => classification.matchedBy === 'none').length,
        unknownProductTypes: Array.from(unknownCounts, ([productType, count]) => ({ productType, count }))
          .sort((a, b) => b.count - a.count || a.productType.localeCompare(b.productType))
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

  // Public product detail: one active, classified Giovetta product by handle.
  app.get('/catalog/products/:handle', async (request, reply) => {
    const params = parseCatalogHandle((request.params as { handle?: unknown }).handle);

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

    let data: ShopifyCatalogProductResult;

    try {
      data = await createShopifyClient(config).query<ShopifyCatalogProductResult>(CATALOG_PRODUCT_QUERY, {
        handle: params.handle
      });
    } catch (error) {
      // Public endpoint: Shopify/GraphQL details stay in the server log only.
      request.log.error(error);
      return reply.code(502).send({ ok: false, error: 'Nie udało się pobrać produktu.' });
    }

    const product = toCatalogProductDetail(data.productByIdentifier, store);

    if (!product) {
      return reply.code(404).send({ ok: false, error: 'Produkt nie istnieje' });
    }

    return { ok: true, product };
  });
}
