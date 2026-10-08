import {
  buildCatalogTaxonomy,
  classifyProductType,
  type CatalogTaxonomy,
  type StoreConfig
} from '@dropshipping/stores';

// Public, read-only catalog model for GET /catalog/products. Only fields that
// are safe to expose leave this module (no inventory, vendor, tags or status).

export const DEFAULT_CATALOG_PAGE_SIZE = 24;
export const MAX_CATALOG_PAGE_SIZE = 50;

// Shopify cursors are opaque base64-like strings.
const CURSOR_PATTERN = /^[A-Za-z0-9+/=_-]{1,512}$/;

// status:active is filtered by Shopify so pagination only walks active products.
export const CATALOG_PRODUCTS_SEARCH = 'status:active';

// Fields of one product node, shared by the list and the single-product query
// so both endpoints expose exactly the same public product.
const CATALOG_PRODUCT_FIELDS = `
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
            id
            title
            price
            availableForSale
            selectedOptions {
              name
              value
            }
          }
        }`;

export const CATALOG_PRODUCTS_QUERY = `
  query catalogProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      nodes {${CATALOG_PRODUCT_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// The handle is passed as a GraphQL variable, never interpolated into a search string.
export const CATALOG_PRODUCT_QUERY = `
  query catalogProduct($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) {${CATALOG_PRODUCT_FIELDS}
    }
  }
`;

// Cart validation: every variant with its product, so the product can be checked
// against the same public-catalog rules. IDs are passed as a GraphQL variable.
export const CATALOG_CART_VARIANTS_QUERY = `
  query catalogCartVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        availableForSale
        product {${CATALOG_PRODUCT_FIELDS}
        }
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
  variants: { nodes: ShopifyCatalogVariant[] };
};

export type ShopifyCatalogVariant = {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
};

export type ShopifyCatalogPage = {
  products: {
    nodes: ShopifyCatalogNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type ShopifyCatalogProductResult = {
  productByIdentifier: ShopifyCatalogNode | null;
};

// Non-variant or unknown IDs come back as null or an object without these fields.
export type ShopifyCartVariant = {
  id?: string;
  availableForSale?: boolean;
  product?: ShopifyCatalogNode | null;
};

export type ShopifyCartVariantsResult = {
  nodes: Array<ShopifyCartVariant | null>;
};

// Variant data needed to pick a size/colour and add it to a cart; no inventory.
export type CatalogVariant = {
  id: string;
  title: string;
  price: number;
  currency: string;
  available: boolean;
  options: Array<{ name: string; value: string }>;
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
  // Catalog/filter/URL identifiers derived from the store config; never written to Shopify.
  categorySlug: string | null;
  subcategorySlug: string | null;
  variants: CatalogVariant[];
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

// Shopify handles: lowercase letters, digits, single '-' or '_' separators.
const HANDLE_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MAX_HANDLE_LENGTH = 255;

export function parseCatalogHandle(value: unknown): { ok: true; handle: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || value.length > MAX_HANDLE_LENGTH || !HANDLE_PATTERN.test(value)) {
    return { ok: false, error: 'Nieprawidłowy identyfikator produktu' };
  }

  return { ok: true, handle: value };
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

// productType holds the Giovetta subcategory; a category name still yields a
// product without a subcategory. Matching is exact: subcategory → category → none.
export function resolveCategory(
  productType: string,
  store: StoreConfig
): { category: string | null; subcategory: string | null } {
  const { category, subcategory } = classifyProductType(productType, buildCatalogTaxonomy(store));
  return { category, subcategory };
}

function toPublicProduct(node: ShopifyCatalogNode, taxonomy: CatalogTaxonomy): CatalogProduct {
  const classification = classifyProductType(node.productType, taxonomy);

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    price: Number(node.priceRange.minVariantPrice.amount),
    currency: node.priceRange.minVariantPrice.currencyCode,
    images: node.images.nodes.map(({ url, altText }) => ({ url, altText })),
    available: isAvailable(node),
    category: classification.category,
    subcategory: classification.subcategory,
    categorySlug: classification.categorySlug,
    subcategorySlug: classification.subcategorySlug,
    variants: node.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: Number(variant.price),
      // Shopify prices every variant in the shop currency, same as priceRange.
      currency: node.priceRange.minVariantPrice.currencyCode,
      available: variant.availableForSale,
      options: variant.selectedOptions.map(({ name, value }) => ({ name, value }))
    }))
  };
}

export function toCatalogProduct(node: ShopifyCatalogNode, store: StoreConfig): CatalogProduct {
  return toPublicProduct(node, buildCatalogTaxonomy(store));
}

// Single public product: same filters and classification as the list; anything
// outside the public Giovetta catalog is null (the route answers 404).
export function toCatalogProductDetail(
  node: ShopifyCatalogNode | null,
  store: StoreConfig
): CatalogProduct | null {
  if (!node || !matchesCatalogFilters(node, store)) {
    return null;
  }

  const taxonomy = buildCatalogTaxonomy(store);

  if (classifyProductType(node.productType, taxonomy).matchedBy === 'none') {
    return null;
  }

  return toPublicProduct(node, taxonomy);
}

// A variant can be bought only if its product is in the public Giovetta catalog
// (same filters and classification as the catalog endpoints) and it is available.
export function isPurchasableCatalogVariant(
  variant: ShopifyCartVariant | null | undefined,
  store: StoreConfig
): boolean {
  if (!variant || typeof variant.id !== 'string' || variant.availableForSale !== true) {
    return false;
  }

  return toCatalogProductDetail(variant.product ?? null, store) !== null;
}

// Filtering happens after Shopify paginates, so a page can hold fewer than
// `first` products; clients keep following nextCursor until it is null.
// Products whose productType matches no category are left out of the public
// catalog; /catalog/coverage reports them.
export function toCatalogPage(data: ShopifyCatalogPage, store: StoreConfig): CatalogPage {
  const { nodes, pageInfo } = data.products;
  const taxonomy = buildCatalogTaxonomy(store);

  return {
    products: nodes
      .filter((node) => matchesCatalogFilters(node, store))
      .filter((node) => classifyProductType(node.productType, taxonomy).matchedBy !== 'none')
      .map((node) => toPublicProduct(node, taxonomy)),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null
  };
}
