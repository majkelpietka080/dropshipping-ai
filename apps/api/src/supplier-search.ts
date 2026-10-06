import { publicErrorDetails } from './security.js';

export type SupplierSearchInput = Parameters<
  ReturnType<typeof import('./suppliers.js').createSupplierManager>['searchProducts']
>[0];

// Searches all suppliers; a failing supplier is reported in supplierErrors
// instead of failing the request. Throws only when every result is an error.
export async function searchSuppliers(params: SupplierSearchInput) {
  const { createSupplierManager } = await import('./suppliers.js');
  const manager = createSupplierManager();
  const { products, errors } = await manager.searchProductsWithErrors(params);

  const supplierErrors = errors.map((error) => ({
    supplier: error.supplier,
    message: publicErrorDetails(error.message)
  }));

  if (products.length === 0 && supplierErrors.length > 0) {
    throw Object.assign(
      new Error(supplierErrors.map((error) => `${error.supplier}: ${error.message}`).join('; ')),
      { supplierErrors }
    );
  }

  return { manager, products, supplierErrors };
}
