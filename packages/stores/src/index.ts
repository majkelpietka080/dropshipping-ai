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
  productSubcategories?: Record<string, string[]>;
  catalogCoverage?: Record<string, {
    minimumProducts: number;
  }>;
  catalog?: {
    shopifyVendor?: string;
    excludeProductTypes?: string[];
    requiredTags?: string[];
    requireAvailable?: boolean;
  };
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


export type StoreProposal = {
  id: string;
  name: string;
  tagline: string;
  niche: string;
  productCategories: string[];
  brand: NonNullable<StoreConfig["brand"]>;
  aiInfluencer: NonNullable<StoreConfig["aiInfluencer"]>;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export function createStoreProposal(input: Omit<StoreProposal, "id" | "status" | "createdAt">): StoreProposal {
  return {
    ...input,
    id: crypto.randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString()
  };
}
