import test from 'node:test';
import assert from 'node:assert/strict';
import { convertCurrency, normalizeCurrencyCode, type ExchangeRateProvider } from '../src/currency.js';
import { FrankfurterExchangeRateProvider } from '../src/frankfurter.js';

function fixedProvider(rate: number) {
  const calls: Array<[string, string]> = [];
  const provider: ExchangeRateProvider = {
    async getRate(from, to) {
      calls.push([from, to]);
      return rate;
    }
  };
  return { provider, calls };
}

test('same currency in different case does not hit the provider', async () => {
  const { provider, calls } = fixedProvider(4.3);

  assert.equal(await convertCurrency(10, 'pln', 'PLN', provider), 10);
  assert.equal(calls.length, 0);
});

test('currency codes are normalized before reaching the provider', async () => {
  const { provider, calls } = fixedProvider(4);

  assert.equal(await convertCurrency(10, ' eur', 'pln ', provider), 40);
  assert.deepEqual(calls, [['EUR', 'PLN']]);
});

test('invalid amounts and currency codes are rejected', async () => {
  const { provider } = fixedProvider(4);

  await assert.rejects(convertCurrency(Number.NaN, 'EUR', 'PLN', provider), /Nieprawidłowa kwota/);
  await assert.rejects(convertCurrency(10, 'EURO', 'PLN', provider), /Nieprawidłowy kod waluty/);
  assert.throws(() => normalizeCurrencyCode(''), /Nieprawidłowy kod waluty/);
});

test('invalid provider rates are rejected', async () => {
  await assert.rejects(
    convertCurrency(10, 'EUR', 'PLN', fixedProvider(0).provider),
    /Nieprawidłowy kurs/
  );
});

function fakeFetch(handler: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { fn, urls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('Frankfurter caches rates per currency pair', async () => {
  const { fn, urls } = fakeFetch(() => json({ date: '2026-10-06', base: 'EUR', quote: 'PLN', rate: 4.3785 }));
  const provider = new FrankfurterExchangeRateProvider({ fetch: fn });

  const rates = await Promise.all([
    provider.getRate('EUR', 'PLN'),
    provider.getRate('eur', 'pln'),
    provider.getRate('EUR', 'PLN')
  ]);

  assert.deepEqual(rates, [4.3785, 4.3785, 4.3785]);
  assert.deepEqual(urls, ['https://api.frankfurter.dev/v2/rate/EUR/PLN']);
});

test('Frankfurter returns 1 for the same currency without a request', async () => {
  const { fn, urls } = fakeFetch(() => json({}));
  const provider = new FrankfurterExchangeRateProvider({ fetch: fn });

  assert.equal(await provider.getRate('PLN', 'pln'), 1);
  assert.equal(urls.length, 0);
});

test('Frankfurter does not cache failed lookups', async () => {
  let attempt = 0;
  const { fn, urls } = fakeFetch(() =>
    ++attempt === 1
      ? json({ status: 500, message: 'error' }, 500)
      : json({ base: 'EUR', quote: 'PLN', rate: 4.2 })
  );
  const provider = new FrankfurterExchangeRateProvider({ fetch: fn });

  await assert.rejects(provider.getRate('EUR', 'PLN'), /HTTP 500/);
  assert.equal(await provider.getRate('EUR', 'PLN'), 4.2);
  assert.equal(urls.length, 2);
});

test('Frankfurter rejects malformed or mismatched responses', async () => {
  const missingRate = new FrankfurterExchangeRateProvider({ fetch: fakeFetch(() => json({ message: 'x' })).fn });
  const wrongPair = new FrankfurterExchangeRateProvider({
    fetch: fakeFetch(() => json({ base: 'EUR', quote: 'USD', rate: 1.1 })).fn
  });
  const network = new FrankfurterExchangeRateProvider({
    fetch: fakeFetch(() => { throw new Error('ECONNRESET'); }).fn
  });

  await assert.rejects(missingRate.getRate('EUR', 'PLN'), /Nieprawidłowy kurs/);
  await assert.rejects(wrongPair.getRate('EUR', 'PLN'), /innej pary walut/);
  await assert.rejects(network.getRate('EUR', 'PLN'), /ECONNRESET/);
});

test('Frankfurter validates currency codes before requesting', async () => {
  const { fn, urls } = fakeFetch(() => json({}));
  const provider = new FrankfurterExchangeRateProvider({ fetch: fn });

  await assert.rejects(provider.getRate('EUR', '../x'), /Nieprawidłowy kod waluty/);
  assert.equal(urls.length, 0);
});
