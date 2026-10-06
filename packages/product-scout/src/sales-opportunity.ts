import type { SupplierProduct } from '@dropshipping/suppliers';

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
    targetMargin < 0 ||
    targetMargin >= 100 ||
    minimumMargin < 0 ||
    minimumMargin >= 100 ||
    minimumMargin > targetMargin
  ) {
    throw new Error(
      'Nieprawidłowe ustawienie marży docelowej lub minimalnej.'
    );
  }

  const recommendedMultiplier = 1 / (1 - targetMargin / 100);
  const minimumMultiplier = 1 / (1 - minimumMargin / 100);

  const recommendedPrice = Number(
    (product.price * recommendedMultiplier).toFixed(2)
  );

  const minimumAcceptablePrice = Number(
    (product.price * minimumMultiplier).toFixed(2)
  );

  const discountRoom = Number(
    Math.max(0, recommendedPrice - minimumAcceptablePrice).toFixed(2)
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
    finalPrice = Number(
      Math.max(minimumAcceptablePrice, competitorPrice).toFixed(2)
    );

    if (valueAdvantages.length > 0 && finalPrice > competitorPrice) {
      salesStrategy = 'VALUE_SELL';
      reasons.push(
        'Oferta może konkurować dzięki udokumentowanym przewagom wartości.'
      );
    } else {
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

  const grossProfit = Number(
    (finalPrice - product.price).toFixed(2)
  );

  const grossMarginPercent = Number(
    ((grossProfit / finalPrice) * 100).toFixed(1)
  );

  const competitorPriceDifference =
    competitorPrice !== undefined
      ? Number((finalPrice - competitorPrice).toFixed(2))
      : undefined;

  const isSellable =
    product.available &&
    finalPrice >= minimumAcceptablePrice &&
    grossMarginPercent >= minimumMargin &&
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
