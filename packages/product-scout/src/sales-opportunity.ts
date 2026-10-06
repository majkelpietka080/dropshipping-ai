import type { SupplierProduct } from '@dropshipping/suppliers';
import {
  MARGIN_EPSILON,
  isValidMarginPercent,
  isValidPrice,
  priceForMargin,
  roundMoney,
  roundPercent
} from './money.js';

export type SalesStrategy =
  | 'STANDARD_PRICE'
  | 'DISCOUNT'
  | 'VALUE_SELL'
  | 'ALTERNATIVE_PRODUCT'
  | 'BUNDLE'
  | 'LOWER_MARGIN'
  | 'NO_OFFER';

export type SalesOpportunityConfig = {
  targetMarginPercent?: number;
  minimumMarginPercent?: number;
  competitorPrice?: number;
  valueAdvantages?: string[];
};

export type SalesOpportunity = {
  product: SupplierProduct;

  supplierCost: number;
  supplierCurrency: string;

  recommendedPrice: number;
  minimumAcceptablePrice: number;

  // Price the strategy actually sells at; grossProfit/grossMarginPercent refer to it.
  finalPrice: number;

  grossProfit: number;
  grossMarginPercent: number;

  discountRoom: number;

  competitorPrice?: number;
  competitorPriceDifference?: number;

  salesStrategy: SalesStrategy;

  valueAdvantages: string[];
  reasons: string[];

  isSellable: boolean;
};

export function createSalesOpportunity(
  product: SupplierProduct,
  config: SalesOpportunityConfig = {}
): SalesOpportunity {
  const targetMargin = config.targetMarginPercent ?? 55;
  const minimumMargin = config.minimumMarginPercent ?? 20;
  const competitorPrice = config.competitorPrice;
  const valueAdvantages = config.valueAdvantages ?? [];

  if (
    !isValidMarginPercent(targetMargin) ||
    !isValidMarginPercent(minimumMargin) ||
    minimumMargin > targetMargin
  ) {
    throw new Error(
      'Nieprawidłowe ustawienie marży docelowej lub minimalnej.'
    );
  }

  if (competitorPrice !== undefined && !isValidPrice(competitorPrice)) {
    throw new Error(
      `Nieprawidłowa cena konkurencji: ${competitorPrice}.`
    );
  }

  // Suppliers may report a missing price as 0; never compute margins from it.
  if (!isValidPrice(product.price)) {
    return {
      product,
      supplierCost: product.price,
      supplierCurrency: product.currency,
      recommendedPrice: 0,
      minimumAcceptablePrice: 0,
      finalPrice: 0,
      grossProfit: 0,
      grossMarginPercent: 0,
      discountRoom: 0,
      competitorPrice,
      competitorPriceDifference: undefined,
      salesStrategy: 'NO_OFFER',
      valueAdvantages,
      reasons: ['Brak prawidłowej ceny dostawcy.'],
      isSellable: false
    };
  }

  const recommendedPrice = priceForMargin(product.price, targetMargin);
  const minimumAcceptablePrice = priceForMargin(product.price, minimumMargin);

  const discountRoom = roundMoney(
    Math.max(0, recommendedPrice - minimumAcceptablePrice)
  );

  const reasons: string[] = [];

  let salesStrategy: SalesStrategy = 'STANDARD_PRICE';
  let finalPrice = recommendedPrice;

  if (!product.available) {
    salesStrategy = 'NO_OFFER';
    reasons.push('Produkt nie jest obecnie dostępny.');
  } else if (
    competitorPrice !== undefined &&
    competitorPrice < minimumAcceptablePrice
  ) {
    if (valueAdvantages.length > 0) {
      salesStrategy = 'VALUE_SELL';
      reasons.push(
        'Cena konkurencji jest poniżej naszej minimalnej ceny, dlatego oferta wymaga uzasadnionej przewagi wartości.'
      );
    } else {
      salesStrategy = 'NO_OFFER';
      reasons.push(
        'Cena konkurencji jest poniżej naszej minimalnej akceptowalnej ceny i brak potwierdzonej przewagi.'
      );
    }
  } else if (
    competitorPrice !== undefined &&
    competitorPrice < recommendedPrice
  ) {
    if (valueAdvantages.length > 0) {
      // Documented advantages justify keeping the recommended price above
      // the competitor, same as when the competitor is below our minimum.
      salesStrategy = 'VALUE_SELL';
      reasons.push(
        'Oferta może konkurować dzięki udokumentowanym przewagom wartości.'
      );
    } else {
      finalPrice = roundMoney(
        Math.max(minimumAcceptablePrice, competitorPrice)
      );
      salesStrategy = 'DISCOUNT';
      reasons.push(
        'Cena może zostać obniżona w granicach bezpiecznej marży.'
      );
    }
  } else if (valueAdvantages.length > 0) {
    salesStrategy = 'VALUE_SELL';
    reasons.push(
      'Oferta posiada udokumentowane przewagi, które można wykorzystać w komunikacji sprzedażowej.'
    );
  } else {
    salesStrategy = 'STANDARD_PRICE';
    reasons.push(
      'Oferta mieści się w standardowym modelu cenowym.'
    );
  }

  const grossProfit = roundMoney(finalPrice - product.price);
  const rawMarginPercent = ((finalPrice - product.price) / finalPrice) * 100;
  const grossMarginPercent = roundPercent(rawMarginPercent);

  const competitorPriceDifference =
    competitorPrice !== undefined
      ? roundMoney(finalPrice - competitorPrice)
      : undefined;

  const isSellable =
    product.available &&
    finalPrice >= minimumAcceptablePrice &&
    rawMarginPercent + MARGIN_EPSILON >= minimumMargin &&
    salesStrategy !== 'NO_OFFER';

  if (!isSellable && salesStrategy !== 'NO_OFFER') {
    salesStrategy = 'NO_OFFER';
    reasons.push(
      'Oferta nie spełnia minimalnych standardów sprzedażowych.'
    );
  }

  return {
    product,
    supplierCost: product.price,
    supplierCurrency: product.currency,
    recommendedPrice,
    minimumAcceptablePrice,
    finalPrice,
    grossProfit,
    grossMarginPercent,
    discountRoom,
    competitorPrice,
    competitorPriceDifference,
    salesStrategy,
    valueAdvantages,
    reasons,
    isSellable
  };
}
