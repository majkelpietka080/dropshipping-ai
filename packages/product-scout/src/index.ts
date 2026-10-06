import type { SupplierProduct } from '@dropshipping/suppliers';
import {
  MARGIN_EPSILON,
  isValidMarginPercent,
  isValidPrice,
  priceForMargin,
  roundMoney,
  roundPercent
} from './money.js';

export type ProductEvaluation = {
  product: SupplierProduct;
  suggestedPrice: number;
  grossProfit: number;
  grossMarginPercent: number;
  score: number;
  reasons: string[];
};

export type ProductScoutConfig = {
  targetMarginPercent?: number;
  maxDeliveryDays?: number;
};

export function evaluateProduct(
  product: SupplierProduct,
  config: ProductScoutConfig = {}
): ProductEvaluation {
  const targetMargin = config.targetMarginPercent ?? 55;
  const maxDeliveryDays = config.maxDeliveryDays ?? 10;

  if (!isValidMarginPercent(targetMargin)) {
    throw new Error('Nieprawidłowe ustawienie marży docelowej.');
  }

  // Suppliers may report a missing price as 0; never compute margins from it.
  const hasValidPrice = isValidPrice(product.price);

  const suggestedPrice = hasValidPrice
    ? priceForMargin(product.price, targetMargin)
    : 0;

  const grossProfit = hasValidPrice
    ? roundMoney(suggestedPrice - product.price)
    : 0;
  const rawMarginPercent = hasValidPrice
    ? ((suggestedPrice - product.price) / suggestedPrice) * 100
    : 0;
  const grossMarginPercent = roundPercent(rawMarginPercent);

  let score = 50;
  const reasons: string[] = [];

  if (!hasValidPrice) {
    reasons.push('Brak prawidłowej ceny dostawcy.');
  }

  if (product.available) {
    score += 15;
    reasons.push('Produkt jest dostępny.');
  } else {
    score -= 30;
    reasons.push('Produkt jest obecnie niedostępny.');
  }

  if (product.stock !== undefined) {
    if (product.stock >= 50) {
      score += 10;
      reasons.push('Dostępny jest zapas co najmniej 50 sztuk.');
    } else if (product.stock < 10) {
      score -= 10;
      reasons.push('Niski poziom zapasu.');
    }
  }

  if (product.estimatedDeliveryDays !== undefined) {
    if (product.estimatedDeliveryDays <= maxDeliveryDays) {
      score += 10;
      reasons.push('Deklarowany czas dostawy mieści się w limicie.');
    } else {
      score -= 15;
      reasons.push('Deklarowany czas dostawy przekracza limit.');
    }
  }

  if (hasValidPrice && rawMarginPercent + MARGIN_EPSILON >= targetMargin) {
    score += 15;
    reasons.push('Produkt osiąga docelową marżę brutto.');
  } else {
    score -= 10;
    reasons.push('Produkt nie osiąga docelowej marży brutto.');
  }

  score = hasValidPrice ? Math.max(0, Math.min(100, score)) : 0;

  return {
    product,
    suggestedPrice,
    grossProfit,
    grossMarginPercent,
    score,
    reasons
  };
}

export { convertCurrency, normalizeCurrencyCode } from './currency.js';

export type { CurrencyCode, ExchangeRateProvider } from './currency.js';

export { FrankfurterExchangeRateProvider } from './frankfurter.js';

export type { FrankfurterOptions } from './frankfurter.js';

export { createSalesOpportunity } from './sales-opportunity.js';

export type {
  SalesStrategy,
  SalesOpportunity,
  SalesOpportunityConfig
} from './sales-opportunity.js';

export {
  analyzeCompetition
} from './competitive-intelligence.js';

export type {
  CompetitorOffer,
  CompetitiveIntelligence,
  CompetitiveAnalysisOptions
} from './competitive-intelligence.js';

export {
  evaluateCatalogCoverage
} from './catalog-coverage.js';

export type {
  CatalogCoverageRule,
  CatalogCoverageResult
} from './catalog-coverage.js';

export {
  countProductsBySubcategory
} from './catalog-coverage.js';
