export type SupplierProduct = {
  id: string;
  supplier: string;
  title: string;
  description?: string;
  category?: string;
  price: number;
  currency: string;
  available: boolean;
  stock?: number;
  imageUrl?: string;
  productUrl?: string;
  shippingCountry?: string;
  estimatedDeliveryDays?: number;
};

export type SupplierSearchParams = {
  query?: string;
  category?: string;
  maxPrice?: number;
  currency?: string;
  shippingCountry?: string;
  limit?: number;
};

export interface SupplierAdapter {
  name: string;
  searchProducts(params: SupplierSearchParams): Promise<SupplierProduct[]>;
  getProduct(id: string): Promise<SupplierProduct | null>;
}

export { SupplierManager } from "./manager.js";
export { MockSupplier } from "./mock.js";

export { BigBuySupplier } from './adapters/bigbuy.js';
