export type CatalogCoverageRule = {
  minimumProducts: number;
};

export type CatalogCoverageResult = {
  subcategory: string;
  availableProducts: number;
  minimumProducts: number;
  missingProducts: number;
  coveragePercent: number;
  status: 'complete' | 'partial' | 'empty';
};

export function evaluateCatalogCoverage(
  coverage: Record<string, CatalogCoverageRule>,
  productsBySubcategory: Record<string, number>
): CatalogCoverageResult[] {
  return Object.entries(coverage).map(([subcategory, rule]) => {
    const availableProducts = productsBySubcategory[subcategory] ?? 0;
    const minimumProducts = Math.max(0, rule.minimumProducts);
    const missingProducts = Math.max(0, minimumProducts - availableProducts);
    const coveragePercent =
      minimumProducts === 0
        ? 100
        : Math.min(100, Number(((availableProducts / minimumProducts) * 100).toFixed(1)));

    let status: CatalogCoverageResult['status'] = 'complete';

    if (availableProducts === 0) {
      status = 'empty';
    } else if (availableProducts < minimumProducts) {
      status = 'partial';
    }

    return {
      subcategory,
      availableProducts,
      minimumProducts,
      missingProducts,
      coveragePercent,
      status
    };
  });
}

export function countProductsBySubcategory(
  products: Array<{ subcategory?: string }>
): Record<string, number> {
  return products.reduce<Record<string, number>>((counts, product) => {
    if (!product.subcategory) {
      return counts;
    }

    counts[product.subcategory] = (counts[product.subcategory] ?? 0) + 1;
    return counts;
  }, {});
}
