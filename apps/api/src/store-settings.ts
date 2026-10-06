import type { StoreConfig } from '@dropshipping/stores';

type Env = Record<string, string | undefined>;

// Call after dotenv has loaded; an empty value falls back to the default.
export function resolveDefaultStoreSlug(env: Env = process.env): string {
  return env.DEFAULT_STORE_SLUG?.trim() || 'giovetta-living';
}

// Store pricing/delivery settings in the shape Product Scout expects (percent, not fraction).
export function productScoutSettings(store: StoreConfig) {
  return {
    evaluation: {
      targetMarginPercent: store.pricing.targetMarginPercent,
      maxDeliveryDays: store.recommendations.maxDeliveryDays
    },
    salesOpportunity: {
      targetMarginPercent: store.pricing.targetMarginPercent,
      minimumMarginPercent: store.pricing.minimumMarginPercent
    }
  };
}

// productType carries the subcategory so /catalog/coverage can count the product;
// without configured tags the Shopify package keeps its legacy default.
export function shopifyProductAttributes(
  store: StoreConfig,
  proposal: { category: string; subcategory?: string }
) {
  const requiredTags = store.catalog?.requiredTags;

  return {
    vendor: store.catalog?.shopifyVendor ?? store.name,
    tags: requiredTags?.length ? requiredTags : undefined,
    productType: proposal.subcategory ?? proposal.category
  };
}
