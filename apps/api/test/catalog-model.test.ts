import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStoreConfig } from '@dropshipping/stores';
import {
  CATALOG_PRODUCTS_QUERY,
  CATALOG_PRODUCTS_SEARCH,
  matchesCatalogFilters,
  parseCatalogPageParams,
  resolveCategory,
  toCatalogPage,
  toCatalogProduct,
  type ShopifyCatalogNode,
  type ShopifyCatalogVariant
} from '../src/catalog-model.js';
import { loadStoreConfig } from '../src/store-files.js';

const giovetta = await loadStoreConfig('giovetta-living');

function variant(overrides: Partial<ShopifyCatalogVariant> = {}): ShopifyCatalogVariant {
  return {
    id: 'gid://shopify/ProductVariant/11',
    title: 'Czarny / M',
    price: '49.90',
    availableForSale: true,
    selectedOptions: [{ name: 'Kolor', value: 'Czarny' }, { name: 'Rozmiar', value: 'M' }],
    ...overrides
  };
}

function node(overrides: Partial<ShopifyCatalogNode> = {}): ShopifyCatalogNode {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'travel-organizer',
    title: 'Travel Organizer',
    status: 'ACTIVE',
    vendor: 'Giovetta Living',
    productType: 'Organizery',
    tags: ['giovetta', 'internal-note'],
    images: { nodes: [{ url: 'https://cdn.example/1.jpg', altText: 'Organizer' }] },
    priceRange: { minVariantPrice: { amount: '49.90', currencyCode: 'PLN' } },
    variants: {
      nodes: [
        variant({ id: 'gid://shopify/ProductVariant/10', title: 'Czarny / S', price: '49.90', availableForSale: false, selectedOptions: [{ name: 'Kolor', value: 'Czarny' }, { name: 'Rozmiar', value: 'S' }] }),
        variant({ price: '54.90' })
      ]
    },
    ...overrides
  };
}

test('only active products pass the catalog filters', () => {
  assert.equal(matchesCatalogFilters(node(), giovetta), true);
  assert.equal(matchesCatalogFilters(node({ status: 'DRAFT' }), giovetta), false);
  assert.equal(matchesCatalogFilters(node({ status: 'ARCHIVED' }), giovetta), false);
});

test('catalog filters match the store config like /shopify/products', () => {
  // vendor comparison is case-insensitive
  assert.equal(matchesCatalogFilters(node({ vendor: 'GIOVETTA LIVING' }), giovetta), true);
  assert.equal(matchesCatalogFilters(node({ vendor: 'Snowboard Co' }), giovetta), false);
  assert.equal(matchesCatalogFilters(node({ productType: 'Snowboard' }), giovetta), false);
  assert.equal(matchesCatalogFilters(node({ tags: ['other'] }), giovetta), false);
  assert.equal(matchesCatalogFilters(node({ tags: ['GIOVETTA'] }), giovetta), true);
  assert.equal(
    matchesCatalogFilters(node({ variants: { nodes: [variant({ availableForSale: false })] } }), giovetta),
    false
  );
});

test('stores without catalog rules only require ACTIVE status', () => {
  const plain = parseStoreConfig({ id: 'p', name: 'Plain', tagline: 'T' }, 'plain-store');

  assert.equal(matchesCatalogFilters(node({ vendor: 'Anyone', tags: [], variants: { nodes: [] } }), plain), true);
  assert.equal(matchesCatalogFilters(node({ status: 'DRAFT' }), plain), false);
});

test('category is derived from productSubcategories in the store config', () => {
  assert.deepEqual(resolveCategory('Organizery', giovetta), { category: 'Travel & Organization', subcategory: 'Organizery' });
  assert.deepEqual(resolveCategory('bielizna', giovetta), { category: 'Fashion & Accessories', subcategory: 'Bielizna' });
  assert.deepEqual(resolveCategory('Travel & Organization', giovetta), { category: 'Travel & Organization', subcategory: null });
  assert.deepEqual(resolveCategory('  ODZIEŻ DAMSKA '.normalize('NFD'), giovetta), { category: 'Fashion & Accessories', subcategory: 'Odzież damska' });
  assert.deepEqual(resolveCategory('Unknown type', giovetta), { category: null, subcategory: null });
  assert.deepEqual(resolveCategory('', giovetta), { category: null, subcategory: null });
});

test('public product exposes only the allowed fields', () => {
  const product = toCatalogProduct(node(), giovetta);

  assert.deepEqual(Object.keys(product).sort(), [
    'available', 'category', 'categorySlug', 'currency', 'handle', 'id', 'images', 'price', 'subcategory', 'subcategorySlug', 'title', 'variants'
  ]);
  assert.deepEqual(product, {
    id: 'gid://shopify/Product/1',
    handle: 'travel-organizer',
    title: 'Travel Organizer',
    price: 49.9,
    currency: 'PLN',
    images: [{ url: 'https://cdn.example/1.jpg', altText: 'Organizer' }],
    available: true,
    category: 'Travel & Organization',
    subcategory: 'Organizery',
    categorySlug: 'travel-organization',
    subcategorySlug: 'organizery',
    variants: [
      {
        id: 'gid://shopify/ProductVariant/10',
        title: 'Czarny / S',
        price: 49.9,
        currency: 'PLN',
        available: false,
        options: [{ name: 'Kolor', value: 'Czarny' }, { name: 'Rozmiar', value: 'S' }]
      },
      {
        id: 'gid://shopify/ProductVariant/11',
        title: 'Czarny / M',
        price: 54.9,
        currency: 'PLN',
        available: true,
        options: [{ name: 'Kolor', value: 'Czarny' }, { name: 'Rozmiar', value: 'M' }]
      }
    ]
  });

  for (const item of product.variants) {
    assert.deepEqual(Object.keys(item).sort(), ['available', 'currency', 'id', 'options', 'price', 'title']);
  }

  const categoryOnly = toCatalogProduct(node({ productType: 'Travel & Organization' }), giovetta);
  assert.equal(categoryOnly.category, 'Travel & Organization');
  assert.equal(categoryOnly.categorySlug, 'travel-organization');
  assert.equal(categoryOnly.subcategory, null);
  assert.equal(categoryOnly.subcategorySlug, null);
});

test('a page drops filtered products and exposes the next cursor', () => {
  const page = toCatalogPage({
    products: {
      nodes: [
        node(),
        node({ id: 'draft', status: 'DRAFT' }),
        node({ id: 'foreign', vendor: 'Other' }),
        node({ id: 'unclassified', productType: 'Car Lifestyle' }),
        node({ id: 'no-type', productType: '' }),
        node({ id: 'category-only', productType: 'Lifestyle' })
      ],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-2' }
    }
  }, giovetta);

  // Unclassified products are left out of the public catalog; category-only ones stay.
  assert.deepEqual(page.products.map((product) => product.id), ['gid://shopify/Product/1', 'category-only']);
  assert.equal(page.nextCursor, 'cursor-2');

  const last = toCatalogPage({
    products: { nodes: [], pageInfo: { hasNextPage: false, endCursor: 'ignored' } }
  }, giovetta);
  assert.deepEqual(last, { products: [], nextCursor: null });
});

test('page parameters are validated', () => {
  assert.deepEqual(parseCatalogPageParams({}), { ok: true, first: 24, after: null });
  assert.deepEqual(parseCatalogPageParams({ limit: '10', after: 'eyJsYXN0X2lkIjoxfQ==' }), {
    ok: true, first: 10, after: 'eyJsYXN0X2lkIjoxfQ=='
  });

  for (const limit of ['0', '51', '1.5', 'abc', '-1']) {
    assert.equal(parseCatalogPageParams({ limit }).ok, false, `limit=${limit}`);
  }

  for (const after of ['bad cursor', 'x'.repeat(513), '"}{', ['a', 'b']]) {
    assert.equal(parseCatalogPageParams({ after }).ok, false, `after=${String(after)}`);
  }
});

test('the Shopify query filters ACTIVE products and paginates with first/after', () => {
  assert.equal(CATALOG_PRODUCTS_SEARCH, 'status:active');
  assert.match(CATALOG_PRODUCTS_QUERY, /products\(first: \$first, after: \$after, query: \$query\)/);
  assert.match(CATALOG_PRODUCTS_QUERY, /endCursor/);
  assert.doesNotMatch(CATALOG_PRODUCTS_QUERY, /inventory|totalInventory/i);
  assert.match(CATALOG_PRODUCTS_QUERY, /variants\(first: 50\)[\s\S]*selectedOptions/);
});

test('a product without variants exposes an empty list and is not available', () => {
  const product = toCatalogProduct(node({ variants: { nodes: [] } }), giovetta);

  assert.deepEqual(product.variants, []);
  assert.equal(product.available, false);
});
