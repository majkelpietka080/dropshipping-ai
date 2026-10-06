import type {
  SupplierAdapter,
  SupplierProduct,
  SupplierSearchParams
} from './index.js';

export type SupplierSearchError = {
  supplier: string;
  message: string;
};

export type SupplierSearchResult = {
  products: SupplierProduct[];
  errors: SupplierSearchError[];
};

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
    const { products } = await this.searchProductsWithErrors(params);
    return products;
  }

  // One failing supplier must not discard results from the others.
  async searchProductsWithErrors(
    params: SupplierSearchParams
  ): Promise<SupplierSearchResult> {
    const results = await Promise.allSettled(
      this.adapters.map((adapter) => adapter.searchProducts(params))
    );

    const products: SupplierProduct[] = [];
    const errors: SupplierSearchError[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        products.push(...result.value);
      } else {
        errors.push({
          supplier: this.adapters[index].name,
          message:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
        });
      }
    });

    const unique = new Map<string, SupplierProduct>();

    for (const product of products) {
      const key = `${product.supplier}:${product.id}`;
      unique.set(key, product);
    }

    return { products: Array.from(unique.values()), errors };
  }
}
