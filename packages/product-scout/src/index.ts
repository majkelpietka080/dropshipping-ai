import type { SupplierProduct } from '@dropshipping/suppliers';

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

  const multiplier = 1 / (1 - targetMargin / 100);
  const suggestedPrice = Number((product.price * multiplier).toFixed(2));

  const grossProfit = Number((suggestedPrice - product.price).toFixed(2));
  const grossMarginPercent = Number(
    ((grossProfit / suggestedPrice) * 100).toFixed(1)
  );

  let score = 50;
  const reasons: string[] = [];

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

  if (grossMarginPercent >= targetMargin) {
    score += 15;
    reasons.push('Produkt osiąga docelową marżę brutto.');
  } else {
    score -= 10;
    reasons.push('Produkt nie osiąga docelowej marży brutto.');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    product,
    suggestedPrice,
    grossProfit,
    grossMarginPercent,
    score,
    reasons
  };
}

export { convertCurrency } from './currency.js';

export type { CurrencyCode, ExchangeRateProvider } from './currency.js';

export { FrankfurterExchangeRateProvider } from './frankfurter.js';

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
  CompetitiveIntelligence
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
