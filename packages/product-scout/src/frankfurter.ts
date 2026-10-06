import type { CurrencyCode, ExchangeRateProvider } from './currency.js';

type FrankfurterRateResponse = {
  date: string;
  base: string;
  quote: string;
  rate: number;
};

export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  private readonly baseUrl = 'https://api.frankfurter.dev/v2';

  async getRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
    const base = from.toLowerCase();
    const quote = to.toLowerCase();

    const response = await fetch(
      `${this.baseUrl}/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`
    );

    if (!response.ok) {
      throw new Error(
        `Nie udało się pobrać kursu ${from}/${to}. HTTP ${response.status}.`
      );
    }

    const data = (await response.json()) as FrankfurterRateResponse;

    if (!Number.isFinite(data.rate) || data.rate <= 0) {
      throw new Error(`Nieprawidłowy kurs ${from}/${to} otrzymany z Frankfurter.`);
    }

    return data.rate;
  }
}
