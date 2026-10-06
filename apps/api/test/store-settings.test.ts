import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countProductsBySubcategory,
  createSalesOpportunity,
  evaluateCatalogCoverage,
  evaluateProduct
} from '@dropshipping/product-scout';
import { parseStoreConfig } from '@dropshipping/stores';
import { loadStoreConfig } from '../src/store-files.js';
import {
  productScoutSettings,
  resolveDefaultStoreSlug,
  shopifyProductAttributes
} from '../src/store-settings.js';

const product = {
  id: 'p1',
  supplier: 'Mock',
  title: 'Organizer',
  price: 10,
  currency: 'PLN',
  available: true,
  estimatedDeliveryDays: 12
};

function store(overrides: Record<string, unknown> = {}) {
  return parseStoreConfig({ id: 's', name: 'Shop Name', tagline: 'T', ...overrides }, 'test-store');
}

test('DEFAULT_STORE_SLUG defaults to giovetta-living and can be overridden', () => {
  assert.equal(resolveDefaultStoreSlug({}), 'giovetta-living');
  assert.equal(resolveDefaultStoreSlug({ DEFAULT_STORE_SLUG: '' }), 'giovetta-living');
  assert.equal(resolveDefaultStoreSlug({ DEFAULT_STORE_SLUG: 'casa-verde-2' }), 'casa-verde-2');
});

test('Product Scout prices with the store margins in percent', async () => {
  const settings = productScoutSettings(await loadStoreConfig('giovetta-living'));

  assert.deepEqual(settings.evaluation, { targetMarginPercent: 55, maxDeliveryDays: 10 });
  assert.deepEqual(settings.salesOpportunity, { targetMarginPercent: 55, minimumMarginPercent: 20 });

  const evaluation = evaluateProduct(product, settings.evaluation);
  const opportunity = createSalesOpportunity(product, settings.salesOpportunity);

  // 10 / (1 - 0.55) rounded up to cents; 0.55 used as percent would give ~10.06.
  assert.equal(evaluation.suggestedPrice, 22.23);
  assert.equal(opportunity.recommendedPrice, 22.23);
  assert.equal(opportunity.minimumAcceptablePrice, 12.5);
});

test('a different store configuration changes Product Scout results', () => {
  const lowMargin = productScoutSettings(store({
    pricing: { targetMarginPercent: 40, minimumMarginPercent: 10 },
    recommendations: { maxDeliveryDays: 14 }
  }));

  const evaluation = evaluateProduct(product, lowMargin.evaluation);
  const opportunity = createSalesOpportunity(product, lowMargin.salesOpportunity);

  assert.equal(evaluation.suggestedPrice, 16.67);
  assert.ok(evaluation.reasons.includes('Deklarowany czas dostawy mieści się w limicie.'));
  assert.equal(opportunity.minimumAcceptablePrice, 11.12);

  const strictDelivery = evaluateProduct(product, productScoutSettings(store()).evaluation);
  assert.ok(strictDelivery.reasons.includes('Deklarowany czas dostawy przekracza limit.'));
});

test('Shopify product uses the configured vendor and required tags', async () => {
  const giovetta = await loadStoreConfig('giovetta-living');
  const attributes = shopifyProductAttributes(giovetta, { category: 'Travel & Organization', subcategory: 'Organizery' });

  assert.equal(attributes.vendor, 'GIOVETTA LIVING');
  assert.deepEqual(attributes.tags, ['giovetta']);
});

test('without catalog config the vendor falls back to the store name and tags to the Shopify default', () => {
  const attributes = shopifyProductAttributes(store(), { category: 'Kitchen' });

  assert.equal(attributes.vendor, 'Shop Name');
  assert.equal(attributes.tags, undefined);
});

test('productType is the subcategory, so catalog coverage can count it', () => {
  const giovettaLike = store({
    productCategories: ['Travel & Organization'],
    productSubcategories: { 'Travel & Organization': ['Organizery'] },
    catalogCoverage: { Organizery: { minimumProducts: 1 } }
  });

  const attributes = shopifyProductAttributes(giovettaLike, { category: 'Travel & Organization', subcategory: 'Organizery' });

  assert.equal(attributes.productType, 'Organizery');

  // Same mapping /catalog/coverage applies to Shopify products (productType -> subcategory).
  const coverage = evaluateCatalogCoverage(
    giovettaLike.catalogCoverage ?? {},
    countProductsBySubcategory([{ subcategory: attributes.productType }])
  );
  assert.deepEqual(coverage.map((entry) => [entry.subcategory, entry.status]), [['Organizery', 'complete']]);

  const legacyType = evaluateCatalogCoverage(
    giovettaLike.catalogCoverage ?? {},
    countProductsBySubcategory([{ subcategory: 'Travel & Organization' }])
  );
  assert.equal(legacyType[0].status, 'empty');
});

test('productType falls back to the category without a subcategory', () => {
  assert.equal(shopifyProductAttributes(store(), { category: 'Kitchen' }).productType, 'Kitchen');
});
