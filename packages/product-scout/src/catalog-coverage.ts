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
    const minimumProducts = Number.isFinite(rule.minimumProducts)
      ? Math.max(0, Math.ceil(rule.minimumProducts))
      : 0;
    const missingProducts = Math.max(0, minimumProducts - availableProducts);
    const coveragePercent =
      minimumProducts === 0
        ? 100
        : Math.min(100, Number(((availableProducts / minimumProducts) * 100).toFixed(1)));

    let status: CatalogCoverageResult['status'] = 'complete';

    // A subcategory with no required minimum is complete even when empty,
    // consistent with its 100% coverage.
    if (availableProducts === 0 && minimumProducts > 0) {
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
    const subcategory = product.subcategory?.trim();

    if (!subcategory) {
      return counts;
    }

    counts[subcategory] = (counts[subcategory] ?? 0) + 1;
    return counts;
  }, {});
}
