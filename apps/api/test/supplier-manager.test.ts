import test from 'node:test';
import assert from 'node:assert/strict';
import { SupplierManager, type SupplierAdapter } from '@dropshipping/suppliers';

const product = (supplier: string, id: string) => ({
  id, supplier, title: id, price: 10, currency: 'EUR', available: true
});

function adapter(name: string, search: SupplierAdapter['searchProducts']): SupplierAdapter {
  return { name, searchProducts: search, getProduct: async () => null };
}

test('one failing supplier does not discard results from others', async () => {
  const manager = new SupplierManager();
  manager.register(adapter('Ok', async () => [product('Ok', '1')]));
  manager.register(adapter('Broken', async () => { throw new Error('HTTP 500'); }));

  const result = await manager.searchProductsWithErrors({});

  assert.deepEqual(result.products.map((p) => p.id), ['1']);
  assert.deepEqual(result.errors, [{ supplier: 'Broken', message: 'HTTP 500' }]);
  assert.equal((await manager.searchProducts({})).length, 1);
});
