export type StoreConfig = {
  id: string;
  name: string;
  tagline: string;
  market: string;
  currency: string;
  language: string;
  supplierStrategy: string;
  targetMargin: number;
  maxDeliveryDays: number;
  approvalRequired: boolean;
  niche?: string;
  productCategories?: string[];
  brand?: {
    primaryColor?: string;
    secondaryColor?: string;
    style?: string;
  };
  aiInfluencer?: {
    enabled: boolean;
    name?: string;
    ageRange?: string;
    personality?: string[];
  };
};


export function createStoreConfig(input: Partial<StoreConfig> & Pick<StoreConfig, "id" | "name" | "tagline">): StoreConfig {
  return {
    market: "EU",
    currency: "EUR",
    language: "pl",
    supplierStrategy: "multi-supplier",
    targetMargin: 0.55,
    maxDeliveryDays: 10,
    approvalRequired: true,
    ...input
  };
}
