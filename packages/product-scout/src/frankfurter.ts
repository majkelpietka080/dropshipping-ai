import {
  normalizeCurrencyCode,
  type CurrencyCode,
  type ExchangeRateProvider
} from './currency.js';

type FrankfurterRateResponse = {
  date?: string;
  base?: string;
  quote?: string;
  rate?: unknown;
};

export type FrankfurterOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  fetch?: typeof fetch;
};

export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<
    string,
    { rate: Promise<number>; expiresAt: number }
  >();

  constructor(options: FrankfurterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.frankfurter.dev/v2').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 60 * 60 * 1000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async getRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
    const base = normalizeCurrencyCode(from);
    const quote = normalizeCurrencyCode(to);

    if (base === quote) {
      return 1;
    }

    const key = `${base}/${quote}`;
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.rate;
    }

    const rate = this.fetchRate(base, quote);
    this.cache.set(key, { rate, expiresAt: Date.now() + this.cacheTtlMs });

    // Failed lookups must not be served from cache on the next call.
    rate.catch(() => {
      if (this.cache.get(key)?.rate === rate) {
        this.cache.delete(key);
      }
    });

    return rate;
  }

  private async fetchRate(base: string, quote: string): Promise<number> {
    let response: Response;

    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`,
        { signal: AbortSignal.timeout(this.timeoutMs) }
      );
    } catch (error) {
      throw new Error(
        `Nie udało się pobrać kursu ${base}/${quote}: ${error instanceof Error ? error.message : String(error)}.`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Nie udało się pobrać kursu ${base}/${quote}. HTTP ${response.status}.`
      );
    }

    const data = (await response.json()) as FrankfurterRateResponse | null;
    const rate = data?.rate;

    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Nieprawidłowy kurs ${base}/${quote} otrzymany z Frankfurter.`);
    }

    if (
      (data?.base !== undefined && data.base.toUpperCase() !== base) ||
      (data?.quote !== undefined && data.quote.toUpperCase() !== quote)
    ) {
      throw new Error(
        `Frankfurter zwrócił kurs dla innej pary walut (${data?.base}/${data?.quote}) niż ${base}/${quote}.`
      );
    }

    return rate;
  }
}
