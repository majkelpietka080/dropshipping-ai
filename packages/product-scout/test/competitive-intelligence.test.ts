import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCompetition } from '../src/competitive-intelligence.js';
import { makeProduct } from './helpers.js';

test('competitor warranty is not reported as our verified advantage', () => {
  const result = analyzeCompetition(makeProduct(), {
    name: 'Rival',
    price: 20,
    currency: 'EUR',
    warrantyMonths: 24
  });

  assert.deepEqual(result.advantages, []);
  assert.equal(result.hasVerifiedAdvantage, false);
  assert.match(result.disadvantages.join(' '), /gwarancję 24 miesięcy/);
});

test('competitor return period below 14 days counts as our advantage', () => {
  const result = analyzeCompetition(makeProduct(), {
    name: 'Rival',
    price: 20,
    currency: 'EUR',
    returnDays: 7
  });

  assert.deepEqual(result.disadvantages, []);
  assert.match(result.advantages.join(' '), /7 dni na zwrot/);
  assert.equal(result.hasVerifiedAdvantage, true);
});

test('zero-month competitor warranty is ignored', () => {
  const result = analyzeCompetition(makeProduct(), {
    name: 'Rival',
    price: 20,
    currency: 'EUR',
    warrantyMonths: 0
  });

  assert.deepEqual(result.disadvantages, []);
});

test('delivery time comparison is reported from our perspective', () => {
  const faster = analyzeCompetition(makeProduct({ estimatedDeliveryDays: 2 }), {
    name: 'Rival', price: 20, currency: 'EUR', shippingDays: 5
  });
  const slower = analyzeCompetition(makeProduct({ estimatedDeliveryDays: 7 }), {
    name: 'Rival', price: 20, currency: 'EUR', shippingDays: 5
  });

  assert.equal(faster.advantages.length, 1);
  assert.equal(slower.disadvantages.length, 1);
});

test('price difference is not computed across different currencies', () => {
  const result = analyzeCompetition(makeProduct({ price: 10, currency: 'EUR' }), {
    name: 'Rival',
    price: 40,
    currency: 'PLN'
  });

  assert.equal(result.priceDifference, undefined);
  assert.equal(result.priceDifferencePercent, undefined);
});

test('currency comparison is case-insensitive', () => {
  const result = analyzeCompetition(makeProduct({ price: 10, currency: 'eur' }), {
    name: 'Rival',
    price: 8,
    currency: 'EUR'
  });

  assert.equal(result.priceDifference, 2);
  assert.equal(result.priceDifferencePercent, 25);
});

test('ourPrice option compares our selling price instead of supplier cost', () => {
  const result = analyzeCompetition(
    makeProduct({ price: 10 }),
    { name: 'Rival', price: 20, currency: 'EUR' },
    { ourPrice: 22.5 }
  );

  assert.equal(result.priceDifference, 2.5);
  assert.equal(result.priceDifferencePercent, 12.5);
});

test('no competitor yields an empty analysis', () => {
  const result = analyzeCompetition(makeProduct());

  assert.equal(result.competitor, undefined);
  assert.equal(result.hasVerifiedAdvantage, false);
});
