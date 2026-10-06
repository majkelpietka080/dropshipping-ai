import test from 'node:test';
import assert from 'node:assert/strict';
import { countProductsBySubcategory, evaluateCatalogCoverage } from '../src/catalog-coverage.js';

test('coverage statuses reflect available vs required products', () => {
  const result = evaluateCatalogCoverage(
    { Lampy: { minimumProducts: 4 }, Poduszki: { minimumProducts: 2 }, Wazony: { minimumProducts: 3 } },
    { Lampy: 1, Poduszki: 5 }
  );

  assert.deepEqual(
    result.map((r) => [r.subcategory, r.status, r.missingProducts, r.coveragePercent]),
    [
      ['Lampy', 'partial', 3, 25],
      ['Poduszki', 'complete', 0, 100],
      ['Wazony', 'empty', 3, 0]
    ]
  );
});

test('subcategory without a minimum is complete even when empty', () => {
  const [result] = evaluateCatalogCoverage({ Lampy: { minimumProducts: 0 } }, {});

  assert.equal(result.status, 'complete');
  assert.equal(result.coveragePercent, 100);
});

test('invalid minimums are treated as zero', () => {
  const [result] = evaluateCatalogCoverage({ Lampy: { minimumProducts: Number.NaN } }, {});

  assert.equal(result.minimumProducts, 0);
  assert.equal(result.status, 'complete');
});

test('subcategory counting ignores blanks and trims names', () => {
  assert.deepEqual(
    countProductsBySubcategory([
      { subcategory: 'Lampy' },
      { subcategory: ' Lampy ' },
      { subcategory: '' },
      { subcategory: '   ' },
      {}
    ]),
    { Lampy: 2 }
  );
});
