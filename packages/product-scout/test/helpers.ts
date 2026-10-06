import type { SupplierProduct } from '@dropshipping/suppliers';

export function makeProduct(overrides: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    id: 'p1',
    supplier: 'Mock',
    title: 'Test product',
    price: 10,
    currency: 'EUR',
    available: true,
    ...overrides
  };
}
