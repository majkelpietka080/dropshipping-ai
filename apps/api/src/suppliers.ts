import {
  AllegroSupplier,
  BigBuySupplier,
  MockSupplier,
  SupplierManager
} from '@dropshipping/suppliers';

export function createSupplierManager() {
  const manager = new SupplierManager();

  manager.register(new MockSupplier());
  manager.register(new BigBuySupplier());
  manager.register(new AllegroSupplier());

  return manager;
}
