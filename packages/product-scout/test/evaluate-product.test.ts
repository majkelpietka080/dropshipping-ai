import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProduct } from '../src/index.js';
import { makeProduct } from './helpers.js';

test('cheap products are not penalized by price rounding', () => {
  // 0.1 / 0.45 = 0.2222; rounding to 0.22 gave 54.5% and a "below target" penalty.
  const result = evaluateProduct(makeProduct({ price: 0.1 }));

  assert.equal(result.suggestedPrice, 0.23);
  assert.ok(result.reasons.includes('Produkt osiąga docelową marżę brutto.'));
});

test('suggested price matches the existing rounding for regular prices', () => {
  assert.equal(evaluateProduct(makeProduct({ price: 12.5 })).suggestedPrice, 27.78);
  assert.equal(evaluateProduct(makeProduct({ price: 18.9 })).suggestedPrice, 42);
});

test('missing supplier price yields score 0 without NaN', () => {
  const result = evaluateProduct(makeProduct({ price: 0 }));

  assert.equal(result.score, 0);
  assert.equal(result.suggestedPrice, 0);
  assert.equal(result.grossMarginPercent, 0);
  assert.ok(result.reasons.includes('Brak prawidłowej ceny dostawcy.'));
});

test('invalid target margin is rejected', () => {
  assert.throws(() => evaluateProduct(makeProduct(), { targetMarginPercent: 100 }), /marży/);
});
