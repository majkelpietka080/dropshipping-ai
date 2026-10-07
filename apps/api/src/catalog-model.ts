import type { StoreConfig } from '@dropshipping/stores';

// Public, read-only catalog model for GET /catalog/products. Only fields that
// are safe to expose leave this module (no inventory, vendor, tags or status).

export const DEFAULT_CATALOG_PAGE_SIZE = 24;
export const MAX_CATALOG_PAGE_SIZE = 50;

// Shopify cursors are opaque base64-like strings.
const CURSOR_PATTERN = /^[A-Za-z0-9+/=_-]{1,512}$/;

// status:active is filtered by Shopify so pagination only walks active products.
export const CATALOG_PRODUCTS_SEARCH = 'status:active';

export const CATALOG_PRODUCTS_QUERY = `
  query catalogProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      nodes {
        id
        handle
        title
        status
        vendor
        productType
        tags
        images(first: 10) {
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
        variants(first: 50) {
          nodes {
            availableForSale
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type ShopifyCatalogNode = {
  id: string;
  handle: string;
  title: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  images: { nodes: Array<{ url: string; altText: string | null }> };
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  variants: { nodes: Array<{ availableForSale: boolean }> };
};

export type ShopifyCatalogPage = {
  products: {
    nodes: ShopifyCatalogNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type CatalogProduct = {
  id: string;
  handle: string;
  title: string;
  price: number;
  currency: string;
  images: Array<{ url: string; altText: string | null }>;
  available: boolean;
  category: string | null;
  subcategory: string | null;
};

export type CatalogPage = {
  products: CatalogProduct[];
  nextCursor: string | null;
};

export function parseCatalogPageParams(
  query: { limit?: unknown; after?: unknown }
): { ok: true; first: number; after: string | null } | { ok: false; error: string } {
  let first = DEFAULT_CATALOG_PAGE_SIZE;

  if (query.limit !== undefined && query.limit !== '') {
    const limit = Number(query.limit);

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CATALOG_PAGE_SIZE) {
      return { ok: false, error: `Parametr limit musi być liczbą całkowitą 1–${MAX_CATALOG_PAGE_SIZE}` };
    }

    first = limit;
  }

  if (query.after === undefined || query.after === '') {
    return { ok: true, first, after: null };
  }

  if (typeof query.after !== 'string' || !CURSOR_PATTERN.test(query.after)) {
    return { ok: false, error: 'Nieprawidłowy parametr after' };
  }

  return { ok: true, first, after: query.after };
}

function isAvailable(node: ShopifyCatalogNode): boolean {
  return node.variants.nodes.some((variant) => variant.availableForSale);
}

// Same rules as GET /shopify/products, plus ACTIVE status as a second guard.
export function matchesCatalogFilters(node: ShopifyCatalogNode, store: StoreConfig): boolean {
  if (node.status !== 'ACTIVE') {
    return false;
  }

  const catalog = store.catalog;

  if (catalog?.shopifyVendor && node.vendor.toLowerCase() !== catalog.shopifyVendor.toLowerCase()) {
    return false;
  }

  if (
    catalog?.excludeProductTypes?.some(
      (type) => node.productType.toLowerCase() === type.toLowerCase()
    )
  ) {
    return false;
  }

  if (
    catalog?.requiredTags?.length &&
    !catalog.requiredTags.every((requiredTag) =>
      node.tags.some((tag) => tag.toLowerCase() === requiredTag.toLowerCase())
    )
  ) {
    return false;
  }

  if (catalog?.requireAvailable && !isAvailable(node)) {
    return false;
  }

  return true;
}

// productType holds the Giovetta subcategory; a category name or an unknown
// type still yields a product, just without the missing level.
export function resolveCategory(
  productType: string,
  store: StoreConfig
): { category: string | null; subcategory: string | null } {
  const type = productType.trim().toLowerCase();

  if (!type) {
    return { category: null, subcategory: null };
  }

  for (const [category, subcategories] of Object.entries(store.productSubcategories ?? {})) {
    const subcategory = subcategories.find((item) => item.toLowerCase() === type);

    if (subcategory) {
      return { category, subcategory };
    }
  }

  const category = store.productCategories?.find((item) => item.toLowerCase() === type);

  return { category: category ?? null, subcategory: null };
}

export function toCatalogProduct(node: ShopifyCatalogNode, store: StoreConfig): CatalogProduct {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    price: Number(node.priceRange.minVariantPrice.amount),
    currency: node.priceRange.minVariantPrice.currencyCode,
    images: node.images.nodes.map(({ url, altText }) => ({ url, altText })),
    available: isAvailable(node),
    ...resolveCategory(node.productType, store)
  };
}

// Filtering happens after Shopify paginates, so a page can hold fewer than
// `first` products; clients keep following nextCursor until it is null.
export function toCatalogPage(data: ShopifyCatalogPage, store: StoreConfig): CatalogPage {
  const { nodes, pageInfo } = data.products;

  return {
    products: nodes
      .filter((node) => matchesCatalogFilters(node, store))
      .map((node) => toCatalogProduct(node, store)),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null
  };
}
