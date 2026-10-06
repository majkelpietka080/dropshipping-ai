import type { SupplierProduct } from '@dropshipping/suppliers';
import { roundMoney, roundPercent } from './money.js';

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

export type CompetitiveAnalysisOptions = {
  // Our selling price in product.currency. Defaults to the supplier cost
  // (product.price) for backward compatibility.
  ourPrice?: number;
};

// Statutory withdrawal period for distance sales in the EU/PL.
const STATUTORY_RETURN_DAYS = 14;

function sameCurrency(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export function analyzeCompetition(
  product: SupplierProduct,
  competitor?: CompetitorOffer,
  options: CompetitiveAnalysisOptions = {}
): CompetitiveIntelligence {
  if (!competitor) {
    return {
      advantages: [],
      disadvantages: [],
      hasVerifiedAdvantage: false
    };
  }

  const ourPrice = options.ourPrice ?? product.price;

  // Prices in different currencies are not comparable without conversion.
  const comparable =
    sameCurrency(product.currency, competitor.currency) &&
    Number.isFinite(ourPrice) &&
    Number.isFinite(competitor.price);

  const priceDifference = comparable
    ? roundMoney(ourPrice - competitor.price)
    : undefined;

  const priceDifferencePercent =
    priceDifference !== undefined && competitor.price > 0
      ? roundPercent((priceDifference / competitor.price) * 100)
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

  // Lists are written from our perspective. A competitor offering less than
  // the statutory return period is our advantage, since we must offer it.
  if (
    competitor.returnDays !== undefined &&
    competitor.returnDays < STATUTORY_RETURN_DAYS
  ) {
    advantages.push(
      `Konkurent deklaruje tylko ${competitor.returnDays} dni na zwrot (ustawowo ${STATUTORY_RETURN_DAYS} dni).`
    );
  }

  // We have no warranty data for our product, so a declared competitor
  // warranty is a point against us, not a verified advantage.
  if (
    competitor.warrantyMonths !== undefined &&
    competitor.warrantyMonths > 0
  ) {
    disadvantages.push(
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
