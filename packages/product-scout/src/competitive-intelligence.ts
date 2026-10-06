import type { SupplierProduct } from '@dropshipping/suppliers';

export type CompetitorOffer = {
  name: string;
  price: number;
  currency: string;
  shippingDays?: number;
  returnDays?: number;
  warrantyMonths?: number;
  url?: string;
};

export type CompetitiveIntelligence = {
  competitor?: CompetitorOffer;
  priceDifference?: number;
  priceDifferencePercent?: number;

  advantages: string[];
  disadvantages: string[];

  hasVerifiedAdvantage: boolean;
};

export function analyzeCompetition(
  product: SupplierProduct,
  competitor?: CompetitorOffer
): CompetitiveIntelligence {
  if (!competitor) {
    return {
      advantages: [],
      disadvantages: [],
      hasVerifiedAdvantage: false
    };
  }

  const priceDifference = Number(
    (product.price - competitor.price).toFixed(2)
  );

  const priceDifferencePercent =
    competitor.price > 0
      ? Number(((priceDifference / competitor.price) * 100).toFixed(1))
      : undefined;

  const advantages: string[] = [];
  const disadvantages: string[] = [];

  if (
    product.estimatedDeliveryDays !== undefined &&
    competitor.shippingDays !== undefined
  ) {
    if (product.estimatedDeliveryDays < competitor.shippingDays) {
      advantages.push(
        `Szybsza deklarowana dostawa: ${product.estimatedDeliveryDays} dni vs ${competitor.shippingDays} dni.`
      );
    } else if (product.estimatedDeliveryDays > competitor.shippingDays) {
      disadvantages.push(
        `Dłuższa deklarowana dostawa: ${product.estimatedDeliveryDays} dni vs ${competitor.shippingDays} dni.`
      );
    }
  }

  if (
    competitor.returnDays !== undefined &&
    competitor.returnDays < 14
  ) {
    disadvantages.push(
      `Konkurent deklaruje ${competitor.returnDays} dni na zwrot.`
    );
  }

  if (competitor.warrantyMonths !== undefined) {
    advantages.push(
      `Konkurent deklaruje gwarancję ${competitor.warrantyMonths} miesięcy.`
    );
  }

  return {
    competitor,
    priceDifference,
    priceDifferencePercent,
    advantages,
    disadvantages,
    hasVerifiedAdvantage: advantages.length > 0
  };
}
