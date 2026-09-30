import type { SupplierAdapter, SupplierProduct, SupplierSearchParams } from '../index.js';

export class BigBuySupplier implements SupplierAdapter {
  name = 'BigBuy';

  private get apiKey() {
    return process.env.BIGBUY_API_KEY;
  }

  private get baseUrl() {
    return process.env.BIGBUY_API_URL ?? 'https://api.bigbuy.eu';
  }

  async searchProducts(params: SupplierSearchParams): Promise<SupplierProduct[]> {
    if (!this.apiKey) return [];

    const response = await fetch(`${this.baseUrl}/rest/catalog/products.json`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`BigBuy API HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => {
        const text = `${item.name ?? ''} ${item.description ?? ''}`.toLowerCase();

        if (params.query && !text.includes(params.query.toLowerCase())) {
          return false;
        }

        if (
          params.maxPrice !== undefined &&
          Number(item.wholesalePrice ?? 0) > params.maxPrice
        ) {
          return false;
        }

        return true;
      })
      .slice(0, params.limit ?? 20)
      .map((item: any) => ({
        id: String(item.id),
        supplier: this.name,
        title: item.name ?? 'BigBuy product',
        description: item.description,
        price: Number(item.wholesalePrice ?? 0),
        currency: 'EUR',
        available: true,
        shippingCountry: params.shippingCountry ?? 'EU'
      }));
  }

  async getProduct(_id: string): Promise<SupplierProduct | null> {
    return null;
  }
}
