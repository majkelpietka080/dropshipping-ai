import type {
  SupplierAdapter,
  SupplierProduct,
  SupplierSearchParams
} from './index.js';

export class MockSupplier implements SupplierAdapter {
  name = 'Mock Supplier';

  private products: SupplierProduct[] = [
    {
      id: 'travel-organizer-001',
      supplier: this.name,
      title: 'Travel Organizer',
      description: 'Compact travel organizer for documents and accessories.',
      category: 'Travel & Organization',
      price: 12.5,
      currency: 'EUR',
      available: true,
      stock: 120,
      shippingCountry: 'PL',
      estimatedDeliveryDays: 3
    },
    {
      id: 'car-organizer-001',
      supplier: this.name,
      title: 'Car Seat Organizer',
      description: 'Practical organizer for everyday car storage.',
      category: 'Car Lifestyle',
      price: 18.9,
      currency: 'EUR',
      available: true,
      stock: 75,
      shippingCountry: 'PL',
      estimatedDeliveryDays: 4
    }
  ];

  async searchProducts(
    params: SupplierSearchParams
  ): Promise<SupplierProduct[]> {
    let results = this.products;

    if (params.category) {
      results = results.filter(
        (product) => product.category === params.category
      );
    }

    if (params.maxPrice !== undefined) {
      results = results.filter(
        (product) => product.price <= params.maxPrice!
      );
    }

    if (params.query) {
      const query = params.query.toLowerCase();

      results = results.filter((product) =>
        `${product.title} ${product.description ?? ''}`
          .toLowerCase()
          .includes(query)
      );
    }

    return results.slice(0, params.limit ?? 20);
  }

  async getProduct(id: string): Promise<SupplierProduct | null> {
    return this.products.find((product) => product.id === id) ?? null;
  }
}
