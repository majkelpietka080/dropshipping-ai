import { SupplierManager } from '@dropshipping/suppliers';
import { BigBuySupplier, MockSupplier } from '@dropshipping/suppliers';

export function createSupplierManager() {
  const manager = new SupplierManager();

  manager.register(new MockSupplier());
  manager.register(new BigBuySupplier());

  return manager;
}
