import type { FastifyInstance } from 'fastify';
import { sendUpstreamError } from '../http-helpers.js';
import { toShopifyProductGid } from '../product-approval.js';
import { getShopifyConfig } from '../shopify-config.js';
import { loadStoreConfig } from '../store-files.js';

export type ShopifyRouteDependencies = {
  // Resolved by app.ts after .env is loaded.
  defaultStoreSlug: string;
};

type ShopifyProductsData = {
  products: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        handle: string;
        vendor: string;
        productType: string;
        tags: string[];
        totalInventory: number;
        featuredImage: { url: string; altText: string | null } | null;
        images: { nodes: Array<{ url: string; altText: string | null }> };
        priceRange: {
          minVariantPrice: { amount: string; currencyCode: string };
        };
        variants: {
          nodes: Array<{
            id: string;
            title: string;
            price: string;
            compareAtPrice: string | null;
            availableForSale: boolean;
            inventoryQuantity: number | null;
          }>;
        };
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
    };
  };
};

export function registerShopifyRoutes(
  app: FastifyInstance,
  { defaultStoreSlug }: ShopifyRouteDependencies
) {
  app.get('/shopify/products', async (request, reply) => {
    const { createShopifyClient } = await import('@dropshipping/shopify');

    const store = await loadStoreConfig(defaultStoreSlug);
    const config = getShopifyConfig();

    if (!config) {
      return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
    }

    const client = createShopifyClient(config);

    let data: ShopifyProductsData;

    try {
      data = await client.query<ShopifyProductsData>(`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              tags
              totalInventory
              featuredImage {
                url
                altText
              }
              images(first: 5) {
                nodes {
                  url
                  altText
                }
              }
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants(first: 10) {
                nodes {
                  id
                  title
                  price
                  compareAtPrice
                  availableForSale
                  inventoryQuantity
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `);
    } catch (error) {
      return sendUpstreamError(request, reply, 'Nie udało się pobrać produktów Shopify.', error);
    }

    const products = data.products.edges
      .map(({ node }) => node)
      .filter((product) => {
        const catalog = store.catalog;

        if (catalog?.shopifyVendor && product.vendor.toLowerCase() !== catalog.shopifyVendor.toLowerCase()) {
          return false;
        }

        if (
          catalog?.excludeProductTypes?.some(
            (type) => product.productType.toLowerCase() === type.toLowerCase()
          )
        ) {
          return false;
        }

        if (
          catalog?.requiredTags?.length &&
          !catalog.requiredTags.every((requiredTag) =>
            product.tags.some((tag) => tag.toLowerCase() === requiredTag.toLowerCase())
          )
        ) {
          return false;
        }

        if (
          catalog?.requireAvailable &&
          !product.variants.nodes.some((variant) => variant.availableForSale)
        ) {
          return false;
        }

        return true;
      });

    return {
      ok: true,
      products,
      hasNextPage: data.products.pageInfo.hasNextPage
    };
  });


  app.post('/agent/products/:productId/fix-catalog', async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const productGid = toShopifyProductGid(productId);

    if (!productGid) {
      return reply.code(400).send({
        ok: false,
        error: 'Nieprawidłowy identyfikator produktu Shopify.'
      });
    }

    const { createShopifyClient, tagShopifyProduct, setShopifyProductInventory } = await import('@dropshipping/shopify');
    const shopifyConfig = getShopifyConfig();

    if (!shopifyConfig) {
      return reply.code(503).send({
        ok: false,
        error: 'Brakuje konfiguracji Shopify w .env'
      });
    }

    const store = await loadStoreConfig(defaultStoreSlug);
    const requiredTags = store.catalog?.requiredTags?.length ? store.catalog.requiredTags : ['giovetta'];

    try {
      const { product } = await createShopifyClient(shopifyConfig).query<{
        product: { id: string; vendor: string; tags: string[] } | null;
      }>(`
        query catalogProduct($id: ID!) {
          product(id: $id) {
            id
            vendor
            tags
          }
        }
      `, { id: productGid });

      if (!product) {
        return reply.code(404).send({
          ok: false,
          error: 'Produkt nie istnieje w Shopify.'
        });
      }

      // Only products of this store's catalog may be modified, never other vendors' products.
      const vendor = store.catalog?.shopifyVendor ?? store.name;

      if (product.vendor.toLowerCase() !== vendor.toLowerCase()) {
        return reply.code(403).send({
          ok: false,
          error: `Produkt nie należy do katalogu sklepu (vendor: ${product.vendor}).`
        });
      }

      // productUpdate replaces tags, so keep the existing ones.
      const tags = Array.from(new Set([...product.tags, ...requiredTags]));

      await tagShopifyProduct(shopifyConfig, product.id, tags);
      await setShopifyProductInventory(shopifyConfig, product.id, 1);
    } catch (error) {
      return sendUpstreamError(request, reply, 'Nie udało się przygotować produktu do katalogu.', error);
    }

    return {
      ok: true,
      message: 'Produkt został przygotowany do katalogu.',
      productId
    };
  });

  app.get('/shopify/product-diagnostic', async (request, reply) => {
    const { createShopifyClient } = await import('@dropshipping/shopify');
    const config = getShopifyConfig();

    if (!config) {
      return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
    }

    const { productId } = request.query as { productId?: string };
    const productGid = toShopifyProductGid(productId);

    if (!productGid) {
      return reply.code(400).send({
        ok: false,
        error: 'Parametr productId (liczbowe ID lub GID produktu Shopify) jest wymagany.'
      });
    }

    const client = createShopifyClient(config);

    try {
      const data = await client.query<{
        product: {
          id: string;
          title: string;
          vendor: string;
          productType: string;
          status: string;
          tags: string[];
          totalInventory: number;
          variants: {
            nodes: Array<{
              availableForSale: boolean;
              inventoryQuantity: number | null;
            }>;
          };
        } | null;
      }>(`
        query productDiagnostic($id: ID!) {
          product(id: $id) {
            id
            title
            vendor
            productType
            status
            tags
            totalInventory
            variants(first: 10) {
              nodes {
                availableForSale
                inventoryQuantity
              }
            }
          }
        }
      `, { id: productGid });

      if (!data.product) {
        return reply.code(404).send({ ok: false, error: 'Produkt nie istnieje w Shopify.' });
      }

      return { ok: true, product: data.product };
    } catch (error) {
      return sendUpstreamError(request, reply, 'Nie udało się pobrać diagnostyki produktu.', error);
    }
  });

  app.get("/shopify/scopes", async (request, reply) => {
    const { createShopifyClient } = await import("@dropshipping/shopify");

    const config = getShopifyConfig();
    if (!config) {
      return reply.code(503).send({ ok: false, error: 'Brakuje konfiguracji Shopify w .env' });
    }

    const client = createShopifyClient(config);

    try {
      return await client.query(`
        query {
          currentAppInstallation {
            accessScopes {
              handle
              description
            }
          }
        }
      `);
    } catch (error) {
      return sendUpstreamError(request, reply, 'Nie udało się pobrać uprawnień Shopify.', error);
    }
  });

  app.get('/shopify/test', async (request, reply) => {
    const { createShopifyClient } = await import('@dropshipping/shopify');
    const config = getShopifyConfig();

    if (!config) {
      return reply.code(503).send({
        ok: false,
        error: 'Brakuje konfiguracji Shopify w .env'
      });
    }

    const client = createShopifyClient(config);

    try {
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
    } catch (error) {
      return sendUpstreamError(request, reply, 'Połączenie z Shopify nie powiodło się.', error);
    }
  });
}
