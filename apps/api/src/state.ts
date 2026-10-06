// Shared in-memory state for product proposals and customer needs, loaded once per process.
import { InFlightGuard } from './product-approval.js';
import { loadJsonArray } from './storage.js';

export type ProductProposal = {
  id: string;
  title: string;
  category: string;
  subcategory?: string;
  supplierProductId?: string;
  imageUrl?: string;
  productUrl?: string;
  reason: string;
  suggestedPrice?: number;
  supplier?: string;
  supplierCost?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  score?: number;
  minimumAcceptablePrice?: number;
  discountRoom?: number;
  salesStrategy?: string;
  valueAdvantages?: string[];
  isSellable?: boolean;
  storeSlug?: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  approvedAt?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

export type CustomerNeed = {
  id: string;
  message: string;
  category?: string;
  budgetMax?: number;
  currency?: string;
  urgency: 'today' | 'few_days' | 'one_two_weeks' | 'browsing';
  neededBy?: string;
  occasion?: 'gift' | 'personal' | 'home' | 'travel' | 'other';
  recipient?: string;
  preferences?: string[];
  status: 'new' | 'searching' | 'matched' | 'offered' | 'purchased' | 'no_match' | 'expired';
  matchedProposalIds?: string[];
  storeSlug?: string;
  createdAt: string;
  updatedAt: string;
};

export const customerNeeds = new Map<string, CustomerNeed>(
  (await loadJsonArray<CustomerNeed>('customer-needs.json')).map((item) => [item.id, item])
);

// No search survives a restart, so 'searching' here was interrupted.
for (const need of customerNeeds.values()) {
  if (need.status === 'searching') {
    need.status = 'new';
  }
}

export const productProposals = new Map<string, ProductProposal>(
  (await loadJsonArray<ProductProposal>('product-proposals.json')).map((item) => [item.id, item])
);

export const productApprovals = new InFlightGuard();

export const customerNeedSearches = new InFlightGuard();
