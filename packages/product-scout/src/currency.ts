export type CurrencyCode = string;

export type ExchangeRateProvider = {
  getRate(from: CurrencyCode, to: CurrencyCode): Promise<number>;
};

export async function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  provider: ExchangeRateProvider
): Promise<number> {
  if (from === to) {
    return amount;
  }

  const rate = await provider.getRate(from, to);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Nieprawidłowy kurs waluty ${from}/${to}.`);
  }

  return amount * rate;
}
