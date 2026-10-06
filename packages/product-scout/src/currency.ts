export type CurrencyCode = string;

export type ExchangeRateProvider = {
  getRate(from: CurrencyCode, to: CurrencyCode): Promise<number>;
};

export function normalizeCurrencyCode(code: CurrencyCode): CurrencyCode {
  const normalized = String(code ?? '').trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`Nieprawidłowy kod waluty: ${code}.`);
  }

  return normalized;
}

export async function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  provider: ExchangeRateProvider
): Promise<number> {
  if (!Number.isFinite(amount)) {
    throw new Error(`Nieprawidłowa kwota do przeliczenia: ${amount}.`);
  }

  const base = normalizeCurrencyCode(from);
  const quote = normalizeCurrencyCode(to);

  if (base === quote) {
    return amount;
  }

  const rate = await provider.getRate(base, quote);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Nieprawidłowy kurs waluty ${base}/${quote}.`);
  }

  return amount * rate;
}
