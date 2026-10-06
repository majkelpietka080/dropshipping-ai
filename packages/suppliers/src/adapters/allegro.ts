import type {
  SupplierAdapter,
  SupplierProduct,
  SupplierSearchParams
} from '../index.js';

export class AllegroSupplier implements SupplierAdapter {
  name = 'Allegro';

  async searchProducts(
    _params: SupplierSearchParams
  ): Promise<SupplierProduct[]> {
    return [];
  }

  async getProduct(_id: string): Promise<SupplierProduct | null> {
    return null;
  }
}

