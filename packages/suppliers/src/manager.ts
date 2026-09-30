import type {
  SupplierAdapter,
  SupplierProduct,
  SupplierSearchParams
} from './index.js';

export class SupplierManager {
  private adapters: SupplierAdapter[] = [];

  register(adapter: SupplierAdapter) {
    this.adapters.push(adapter);
  }

  listSuppliers() {
    return this.adapters.map((adapter) => adapter.name);
  }

  async searchProducts(
    params: SupplierSearchParams
  ): Promise<SupplierProduct[]> {
    const results = await Promise.all(
      this.adapters.map((adapter) => adapter.searchProducts(params))
    );

    const products = results.flat();
    const unique = new Map<string, SupplierProduct>();

    for (const product of products) {
      const key = `${product.supplier}:${product.id}`;
      unique.set(key, product);
    }

    return Array.from(unique.values());
  }
}
