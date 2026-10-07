import type { StoreConfig } from "./index.js";

// Catalog taxonomy derived from the store config (productCategories +
// productSubcategories). The config stays the single source of truth; this
// module only indexes it. Matching is exact on a normalized key — no aliases,
// heuristics or AI.

export type TaxonomySubcategory = {
  name: string;
  slug: string;
};

export type TaxonomyCategory = {
  name: string;
  slug: string;
  subcategories: TaxonomySubcategory[];
};

export type ProductClassification =
  | {
      matchedBy: "subcategory";
      category: string;
      categorySlug: string;
      subcategory: string;
      subcategorySlug: string;
    }
  | {
      matchedBy: "category";
      category: string;
      categorySlug: string;
      subcategory: null;
      subcategorySlug: null;
    }
  | {
      matchedBy: "none";
      category: null;
      categorySlug: null;
      subcategory: null;
      subcategorySlug: null;
    };

export type CatalogTaxonomy = {
  categories: TaxonomyCategory[];
  index: Map<string, ProductClassification>;
};

const UNCLASSIFIED: ProductClassification = {
  matchedBy: "none",
  category: null,
  categorySlug: null,
  subcategory: null,
  subcategorySlug: null
};

// NFC first so composed (ś) and decomposed (s + ◌́) input compare equal.
export function normalizeTaxonomyKey(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pl");
}

// ł has no Unicode decomposition, so it is mapped explicitly before stripping
// diacritics (same approach as store slugs).
export function taxonomySlug(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[łŁ]/g, "l")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildCatalogTaxonomy(
  store: Pick<StoreConfig, "productCategories" | "productSubcategories">
): CatalogTaxonomy {
  const categories: TaxonomyCategory[] = (store.productCategories ?? []).map((name) => ({
    name,
    slug: taxonomySlug(name),
    subcategories: (store.productSubcategories?.[name] ?? []).map((subcategory) => ({
      name: subcategory,
      slug: taxonomySlug(subcategory)
    }))
  }));

  const index = new Map<string, ProductClassification>();

  // Subcategories take precedence over a category with the same key.
  for (const category of categories) {
    for (const subcategory of category.subcategories) {
      index.set(normalizeTaxonomyKey(subcategory.name), {
        matchedBy: "subcategory",
        category: category.name,
        categorySlug: category.slug,
        subcategory: subcategory.name,
        subcategorySlug: subcategory.slug
      });
    }
  }

  for (const category of categories) {
    const key = normalizeTaxonomyKey(category.name);

    if (!index.has(key)) {
      index.set(key, {
        matchedBy: "category",
        category: category.name,
        categorySlug: category.slug,
        subcategory: null,
        subcategorySlug: null
      });
    }
  }

  return { categories, index };
}

// Exact lookup: subcategory → category → none.
export function classifyProductType(
  value: string | null | undefined,
  taxonomy: CatalogTaxonomy
): ProductClassification {
  const key = normalizeTaxonomyKey(value ?? "");

  if (!key) {
    return UNCLASSIFIED;
  }

  return taxonomy.index.get(key) ?? UNCLASSIFIED;
}
