import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreConfigError, createStoreConfig, parseStoreConfig, toPublicStoreConfig } from '../src/index.js';
import { minimalConfig, readStoreFile } from './helpers.js';

function issuesOf(raw: unknown, slug = 'test-store'): string[] {
  try {
    parseStoreConfig(raw, slug);
  } catch (error) {
    assert.ok(error instanceof StoreConfigError);
    return error.issues;
  }
  assert.fail('expected StoreConfigError');
}

test('Giovetta Living config has the agreed market, pricing, audience and persona', async () => {
  const store = parseStoreConfig(await readStoreFile('giovetta-living'), 'giovetta-living');

  assert.equal(store.slug, 'giovetta-living');
  assert.equal(store.market, 'PL');
  assert.equal(store.currency, 'PLN');
  assert.equal(store.language, 'pl');
  assert.equal(store.locale, 'pl-PL');
  assert.deepEqual(store.pricing, {
    targetMarginPercent: 55,
    minimumMarginPercent: 20,
    pricesIncludeVat: true,
    vatRatePercent: 23
  });
  assert.deepEqual(store.recommendations, { maxDeliveryDays: 10 });
  // Customers are 25–60; the persona herself is 30–35.
  assert.deepEqual(store.audience, { ageMin: 25, ageMax: 60 });
  assert.equal(store.aiInfluencer?.ageRange, '30-35');
  // Legacy fields stay in sync for older consumers.
  assert.equal(store.targetMargin, 0.55);
  assert.equal(store.maxDeliveryDays, 10);
  // Existing catalog data is preserved.
  assert.equal(Object.keys(store.catalogCoverage ?? {}).length, 37);
  assert.equal(store.catalog?.shopifyVendor, 'GIOVETTA LIVING');
});

test('Casa Verde legacy config still parses and migrates targetMargin 0.55 to 55%', async () => {
  const store = parseStoreConfig(await readStoreFile('casa-verde-2'), 'casa-verde-2');

  assert.equal(store.slug, 'casa-verde-2');
  assert.equal(store.pricing.targetMarginPercent, 55);
  assert.equal(store.pricing.minimumMarginPercent, 20);
  assert.equal(store.recommendations.maxDeliveryDays, 10);
  assert.equal(store.currency, 'EUR');
  assert.equal(store.locale, 'pl');
  assert.equal(store.audience, undefined);
  assert.equal(store.aiInfluencer?.ageRange, '25-30');
});

test('defaults are applied to a minimal config', () => {
  const store = parseStoreConfig(minimalConfig(), 'test-store');

  assert.equal(store.market, 'EU');
  assert.equal(store.currency, 'EUR');
  assert.equal(store.language, 'pl');
  assert.equal(store.locale, 'pl');
  assert.equal(store.supplierStrategy, 'multi-supplier');
  assert.equal(store.approvalRequired, true);
  assert.deepEqual(store.pricing, {
    targetMarginPercent: 55,
    minimumMarginPercent: 20,
    pricesIncludeVat: false,
    vatRatePercent: 0
  });
  assert.equal(store.maxDeliveryDays, 10);
});

test('locale defaults to language-market for country markets and currency is upper-cased', () => {
  const store = parseStoreConfig(minimalConfig({ market: 'PL', currency: 'pln' }), 'test-store');

  assert.equal(store.locale, 'pl-PL');
  assert.equal(store.currency, 'PLN');
});

test('legacy fields migrate and agree with new fields', () => {
  const legacy = parseStoreConfig(minimalConfig({ targetMargin: 0.4, maxDeliveryDays: 7 }), 'test-store');

  assert.equal(legacy.pricing.targetMarginPercent, 40);
  assert.equal(legacy.recommendations.maxDeliveryDays, 7);

  const both = parseStoreConfig(
    minimalConfig({ targetMargin: 0.55, pricing: { targetMarginPercent: 55 }, maxDeliveryDays: 10, recommendations: { maxDeliveryDays: 10 } }),
    'test-store'
  );
  assert.equal(both.pricing.targetMarginPercent, 55);
});

test('contradicting legacy and new fields are rejected', () => {
  const issues = issuesOf(minimalConfig({
    targetMargin: 0.5,
    pricing: { targetMarginPercent: 55 },
    maxDeliveryDays: 5,
    recommendations: { maxDeliveryDays: 10 }
  }));

  assert.ok(issues.some((issue) => issue.startsWith('targetMargin:')));
  assert.ok(issues.some((issue) => issue.startsWith('maxDeliveryDays:')));
});

test('margins must be 0–100 and minimum must not exceed target', () => {
  assert.ok(issuesOf(minimalConfig({ pricing: { targetMarginPercent: 100 } })).some((i) => i.startsWith('pricing.targetMarginPercent')));
  assert.ok(issuesOf(minimalConfig({ pricing: { minimumMarginPercent: -1 } })).some((i) => i.startsWith('pricing.minimumMarginPercent')));
  assert.ok(issuesOf(minimalConfig({ pricing: { targetMarginPercent: 30, minimumMarginPercent: 40 } }))
    .some((i) => i.includes('nie może być większe niż marża docelowa')));
  assert.ok(issuesOf(minimalConfig({ targetMargin: 55 })).some((i) => i.startsWith('targetMargin')));
});

test('VAT rate is required when prices include VAT', () => {
  assert.ok(issuesOf(minimalConfig({ pricing: { pricesIncludeVat: true } })).some((i) => i.startsWith('pricing.vatRatePercent')));
  assert.ok(issuesOf(minimalConfig({ pricing: { vatRatePercent: 123 } })).some((i) => i.startsWith('pricing.vatRatePercent')));
});

test('currency, language, locale and market formats are validated', () => {
  const issues = issuesOf(minimalConfig({ currency: 'ZŁOTY', language: 'Polish', market: 'Poland' }));

  assert.ok(issues.some((i) => i.startsWith('currency')));
  assert.ok(issues.some((i) => i.startsWith('language')));
  assert.ok(issues.some((i) => i.startsWith('market')));
  assert.ok(issuesOf(minimalConfig({ locale: 'pl_PL' })).some((i) => i.startsWith('locale')));
  assert.ok(issuesOf(minimalConfig({ language: 'pl', locale: 'en-GB' })).some((i) => i.includes('nie pasuje do języka')));
});

test('brand colors must be HEX', () => {
  const issues = issuesOf(minimalConfig({ brand: { primaryColor: 'beige', secondaryColor: '#12345' } }));

  assert.ok(issues.some((i) => i.startsWith('brand.primaryColor')));
  assert.ok(issues.some((i) => i.startsWith('brand.secondaryColor')));
  assert.equal(parseStoreConfig(minimalConfig({ brand: { primaryColor: '#fff', voice: 'ciepły, ironiczny' } }), 'test-store').brand?.voice, 'ciepły, ironiczny');
});

test('audience is the customer age range and must be ordered', () => {
  assert.ok(issuesOf(minimalConfig({ audience: { ageMin: 60, ageMax: 25 } })).some((i) => i.startsWith('audience:')));
  assert.ok(issuesOf(minimalConfig({ audience: { ageMin: 5, ageMax: 30 } })).some((i) => i.startsWith('audience.ageMin')));
  assert.ok(issuesOf(minimalConfig({ audience: { ageMax: 30 } })).some((i) => i.startsWith('audience.ageMin')));
});

test('persona age range must be a valid ascending range', () => {
  assert.ok(issuesOf(minimalConfig({ aiInfluencer: { enabled: true, ageRange: '35-30' } })).some((i) => i.startsWith('aiInfluencer.ageRange')));
  assert.ok(issuesOf(minimalConfig({ aiInfluencer: { enabled: true, ageRange: 'trzydzieści' } })).some((i) => i.startsWith('aiInfluencer.ageRange')));
  assert.ok(issuesOf(minimalConfig({ aiInfluencer: { ageRange: '30-35' } })).some((i) => i.startsWith('aiInfluencer.enabled')));
});

test('catalog coverage minimums must be non-negative integers', () => {
  const base = { productCategories: ['A'], productSubcategories: { A: ['A1', 'A2'] } };

  const issues = issuesOf(minimalConfig({
    ...base,
    catalogCoverage: { A1: { minimumProducts: -1 }, A2: { minimumProducts: 1.5 } }
  }));

  assert.ok(issues.some((i) => i.startsWith('catalogCoverage.A1.minimumProducts')));
  assert.ok(issues.some((i) => i.startsWith('catalogCoverage.A2.minimumProducts')));
});

test('categories, subcategories and coverage targets must be consistent', () => {
  const issues = issuesOf(minimalConfig({
    productCategories: ['A', 'B'],
    productSubcategories: { A: ['A1', 'Shared'], B: ['Shared'], C: ['C1'] },
    catalogCoverage: { A1: { minimumProducts: 1 }, Missing: { minimumProducts: 1 } }
  }));

  assert.ok(issues.some((i) => i.startsWith('productSubcategories.C') && i.includes('productCategories')));
  assert.ok(issues.some((i) => i.includes('"Shared"')));
  assert.ok(issues.some((i) => i.startsWith('catalogCoverage.Missing')));
  assert.ok(issuesOf(minimalConfig({ catalogCoverage: { A1: { minimumProducts: 1 } } }))
    .some((i) => i.includes('wymaga zdefiniowania productSubcategories')));
});

test('slug must be valid and match the store directory', () => {
  assert.throws(() => parseStoreConfig(minimalConfig(), '../outside'), StoreConfigError);
  assert.ok(issuesOf(minimalConfig({ slug: 'other-store' })).some((i) => i.startsWith('slug')));
});

test('errors list every problem in one readable message', () => {
  assert.throws(
    () => parseStoreConfig({ name: 42 }, 'broken-store'),
    (error: unknown) =>
      error instanceof StoreConfigError &&
      error.message.startsWith('Nieprawidłowa konfiguracja sklepu "broken-store":') &&
      error.issues.includes('id: pole jest wymagane') &&
      error.issues.includes('name: musi być niepustym tekstem') &&
      error.issues.includes('tagline: pole jest wymagane')
  );
  assert.throws(() => parseStoreConfig(null, 'broken-store'), /konfiguracja musi być obiektem/);
});

test('createStoreConfig output is valid and keeps legacy and new fields in sync', () => {
  const created = createStoreConfig({ id: 'x', name: 'New Store', tagline: 'T', targetMargin: 0.5, maxDeliveryDays: 8 });

  assert.equal(created.pricing.targetMarginPercent, 50);
  assert.equal(created.recommendations.maxDeliveryDays, 8);
  assert.equal(created.locale, 'pl');

  const parsed = parseStoreConfig(JSON.parse(JSON.stringify(created)), 'new-store');
  assert.equal(parsed.pricing.targetMarginPercent, 50);
  assert.equal(parsed.targetMargin, 0.5);
});

test('public config hides pricing and the legacy margin but keeps other data', async () => {
  const store = parseStoreConfig(await readStoreFile('giovetta-living'), 'giovetta-living');
  const publicStore = toPublicStoreConfig(store);

  assert.equal('pricing' in publicStore, false);
  assert.equal('targetMargin' in publicStore, false);
  assert.equal(publicStore.name, 'Giovetta Living');
  assert.deepEqual(publicStore.audience, store.audience);
  assert.deepEqual(publicStore.catalogCoverage, store.catalogCoverage);
  // The internal config is not mutated.
  assert.equal(store.pricing.targetMarginPercent, 55);
});
