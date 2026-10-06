import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StoreConfigError, toPublicStoreConfig } from '@dropshipping/stores';
import { findAvailableStoreSlug, loadStoreConfig, loadStoreConfigFrom } from '../src/store-files.js';

test('store slugs normalize Polish diacritics and remain URL-safe', async () => {
  const slug = await findAvailableStoreSlug('Żółć Ćma');
  assert.match(slug, /^zolc-cma(?:-\d+)?$/);
});

test('loading a store rejects path traversal slugs', async () => {
  await assert.rejects(loadStoreConfig('../outside'), /Nieprawidłowy identyfikator sklepu/);
});

test('loading Giovetta Living returns the validated config with internal pricing', async () => {
  const store = await loadStoreConfig('giovetta-living');

  assert.equal(store.slug, 'giovetta-living');
  assert.equal(store.currency, 'PLN');
  assert.equal(store.locale, 'pl-PL');
  assert.deepEqual(store.pricing, {
    targetMarginPercent: 55,
    minimumMarginPercent: 20,
    pricesIncludeVat: true,
    vatRatePercent: 23
  });
  assert.equal(store.recommendations.maxDeliveryDays, 10);
  assert.deepEqual(store.audience, { ageMin: 25, ageMax: 60 });
  assert.equal(store.aiInfluencer?.ageRange, '30-35');
});

test('legacy Casa Verde config still loads', async () => {
  const store = await loadStoreConfig('casa-verde-2');

  assert.equal(store.pricing.targetMarginPercent, 55);
  assert.equal(store.slug, 'casa-verde-2');
});

test('invalid store config fails with a readable StoreConfigError', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stores-'));

  try {
    await mkdir(join(root, 'broken-store'));
    await writeFile(
      join(root, 'broken-store', 'store.config.json'),
      JSON.stringify({ id: 'b', name: 'Broken', tagline: 'T', currency: 'ZŁOTY', pricing: { targetMarginPercent: 30, minimumMarginPercent: 40 } })
    );

    await assert.rejects(loadStoreConfigFrom(root, 'broken-store'), (error: unknown) =>
      error instanceof StoreConfigError &&
      /Nieprawidłowa konfiguracja sklepu "broken-store"/.test(error.message) &&
      error.issues.some((issue) => issue.startsWith('currency')) &&
      error.issues.some((issue) => issue.startsWith('pricing.minimumMarginPercent'))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('public store config does not expose pricing while the internal one does', async () => {
  const store = await loadStoreConfig('giovetta-living');
  const publicStore = toPublicStoreConfig(store);

  assert.ok(store.pricing);
  assert.equal(JSON.stringify(publicStore).includes('pricing'), false);
  assert.equal('targetMargin' in publicStore, false);
  assert.equal(publicStore.name, 'Giovetta Living');
});
