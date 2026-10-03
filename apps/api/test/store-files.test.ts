import test from 'node:test';
import assert from 'node:assert/strict';
import { findAvailableStoreSlug, loadStoreConfig } from '../src/store-files.js';

test('store slugs normalize Polish diacritics and remain URL-safe', async () => {
  const slug = await findAvailableStoreSlug('Żółć Ćma');
  assert.match(slug, /^zolc-cma(?:-\d+)?$/);
});

test('loading a store rejects path traversal slugs', async () => {
  await assert.rejects(loadStoreConfig('../outside'), /Nieprawidłowy identyfikator sklepu/);
});
