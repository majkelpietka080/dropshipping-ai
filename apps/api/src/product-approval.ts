// Prevents running the same long operation twice for one id within this process.
export class InFlightGuard {
  private readonly active = new Set<string>();

  tryAcquire(id: string): boolean {
    if (this.active.has(id)) {
      return false;
    }

    this.active.add(id);
    return true;
  }

  release(id: string) {
    this.active.delete(id);
  }

  has(id: string): boolean {
    return this.active.has(id);
  }
}

export type ApprovableProposal = {
  suggestedPrice?: number;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
};

export type CreatedShopifyProduct = {
  productId: string;
  variantId?: string;
  raw: unknown;
};

export type ApprovalSteps = {
  createProduct(): Promise<CreatedShopifyProduct>;
  setPrice(productId: string, variantId: string, price: number): Promise<unknown>;
  setInventory(productId: string): Promise<unknown>;
  persist(): Promise<void>;
};

export type ApprovalOutcome = {
  created?: unknown;
  priceUpdate?: unknown;
  reusedExistingProduct: boolean;
};

// The Shopify product id is persisted right after creation, so a retry after a
// failed price/inventory step reuses that product instead of creating a duplicate.
export async function approveProductProposal(
  proposal: ApprovableProposal,
  steps: ApprovalSteps
): Promise<ApprovalOutcome> {
  let created: unknown;
  const reusedExistingProduct = Boolean(proposal.shopifyProductId);

  if (!proposal.shopifyProductId) {
    const result = await steps.createProduct();

    if (!result.productId) {
      throw new Error('Shopify nie zwrócił identyfikatora utworzonego produktu.');
    }

    proposal.shopifyProductId = result.productId;
    proposal.shopifyVariantId = result.variantId;
    created = result.raw;
    await steps.persist();
  }

  let priceUpdate: unknown;

  if (proposal.suggestedPrice !== undefined && proposal.shopifyVariantId) {
    priceUpdate = await steps.setPrice(
      proposal.shopifyProductId,
      proposal.shopifyVariantId,
      proposal.suggestedPrice
    );
  }

  await steps.setInventory(proposal.shopifyProductId);

  proposal.status = 'approved';
  proposal.approvedAt = new Date().toISOString();
  await steps.persist();

  return { created, priceUpdate, reusedExistingProduct };
}

// Accepts a numeric Shopify product id or a full product GID.
export function toShopifyProductGid(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';

  if (/^\d+$/.test(trimmed)) {
    return `gid://shopify/Product/${trimmed}`;
  }

  return /^gid:\/\/shopify\/Product\/\d+$/.test(trimmed) ? trimmed : null;
}
