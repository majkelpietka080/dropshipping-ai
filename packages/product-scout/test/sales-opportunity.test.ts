import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesOpportunity } from '../src/sales-opportunity.js';
import { makeProduct } from './helpers.js';

test('standard price uses target margin and exposes finalPrice', () => {
  const result = createSalesOpportunity(makeProduct({ price: 18.9 }));

  assert.equal(result.recommendedPrice, 42);
  assert.equal(result.finalPrice, 42);
  assert.equal(result.grossMarginPercent, 55);
  assert.equal(result.salesStrategy, 'STANDARD_PRICE');
  assert.equal(result.isSellable, true);
});

test('discount sells at competitor price and margins refer to finalPrice', () => {
  // cost 10 -> recommended 22.23, minimum 12.50
  const result = createSalesOpportunity(makeProduct({ price: 10 }), { competitorPrice: 15 });

  assert.equal(result.salesStrategy, 'DISCOUNT');
  assert.equal(result.recommendedPrice, 22.23);
  assert.equal(result.finalPrice, 15);
  assert.equal(result.grossProfit, 5);
  assert.equal(result.grossMarginPercent, 33.3);
  assert.equal(result.competitorPriceDifference, 0);
  assert.equal(result.isSellable, true);
});

test('value advantages keep the recommended price when competitor is cheaper', () => {
  const result = createSalesOpportunity(makeProduct({ price: 10 }), {
    competitorPrice: 15,
    valueAdvantages: ['Szybsza dostawa']
  });

  assert.equal(result.salesStrategy, 'VALUE_SELL');
  assert.equal(result.finalPrice, result.recommendedPrice);
  assert.equal(result.competitorPriceDifference, 7.23);
  assert.equal(result.isSellable, true);
});

test('competitor below minimum without advantages yields NO_OFFER', () => {
  const result = createSalesOpportunity(makeProduct({ price: 10 }), { competitorPrice: 11 });

  assert.equal(result.salesStrategy, 'NO_OFFER');
  assert.equal(result.isSellable, false);
});

test('minimum acceptable price never falls below the minimum margin', () => {
  // 0.13 / 0.8 = 0.1625; rounding to 0.16 would give only 18.75% margin.
  const result = createSalesOpportunity(makeProduct({ price: 0.13 }), {
    competitorPrice: 0.17
  });

  assert.equal(result.minimumAcceptablePrice, 0.17);
  assert.equal(result.salesStrategy, 'DISCOUNT');
  assert.equal(result.isSellable, true);
});

test('missing supplier price never produces NaN and is not sellable', () => {
  const result = createSalesOpportunity(makeProduct({ price: 0 }));

  assert.equal(result.salesStrategy, 'NO_OFFER');
  assert.equal(result.isSellable, false);
  assert.equal(result.grossMarginPercent, 0);
  assert.ok(!Object.values(result).some((value) => Number.isNaN(value)));
});

test('invalid configuration is rejected', () => {
  assert.throws(() => createSalesOpportunity(makeProduct(), { targetMarginPercent: Number.NaN }), /marży/);
  assert.throws(() => createSalesOpportunity(makeProduct(), { minimumMarginPercent: 60 }), /marży/);
  assert.throws(() => createSalesOpportunity(makeProduct(), { competitorPrice: 0 }), /cena konkurencji/);
});

test('unavailable product is NO_OFFER', () => {
  const result = createSalesOpportunity(makeProduct({ available: false }));

  assert.equal(result.salesStrategy, 'NO_OFFER');
  assert.equal(result.isSellable, false);
});
