export type StorePricing = {
  targetMarginPercent: number;
  minimumMarginPercent: number;
  pricesIncludeVat: boolean;
  vatRatePercent: number;
};

// Age range of the store's customers (not of the AI persona).
export type StoreAudience = {
  ageMin: number;
  ageMax: number;
  description?: string;
};

export type StoreRecommendations = {
  maxDeliveryDays: number;
};

export type StoreConfig = {
  id: string;
  // Directory name under stores/; set by parseStoreConfig.
  slug?: string;
  name: string;
  tagline: string;
  market: string;
  currency: string;
  language: string;
  locale: string;
  supplierStrategy: string;
  /** @deprecated Fraction 0–1, kept in sync with pricing.targetMarginPercent. */
  targetMargin: number;
  /** @deprecated Kept in sync with recommendations.maxDeliveryDays. */
  maxDeliveryDays: number;
  approvalRequired: boolean;
  pricing: StorePricing;
  recommendations: StoreRecommendations;
  audience?: StoreAudience;
  niche?: string;
  productCategories?: string[];
  productSubcategories?: Record<string, string[]>;
  catalogCoverage?: Record<string, {
    minimumProducts: number;
  }>;
  catalog?: {
    shopifyVendor?: string;
    excludeProductTypes?: string[];
    requiredTags?: string[];
    requireAvailable?: boolean;
  };
  brand?: {
    primaryColor?: string;
    secondaryColor?: string;
    style?: string;
    voice?: string;
  };
  // The AI persona; ageRange ("30-35") is the persona's own age, not the customers'.
  aiInfluencer?: {
    enabled: boolean;
    name?: string;
    ageRange?: string;
    personality?: string[];
  };
};

const DEFAULTS = {
  market: "EU",
  currency: "EUR",
  language: "pl",
  supplierStrategy: "multi-supplier",
  targetMarginPercent: 55,
  minimumMarginPercent: 20,
  pricesIncludeVat: false,
  vatRatePercent: 0,
  maxDeliveryDays: 10,
  approvalRequired: true
};

function defaultLocale(language: string, market: string): string {
  return /^[A-Z]{2}$/.test(market) && market !== "EU" ? `${language}-${market}` : language;
}

// 0.55 * 100 is 55.00000000000001 in floating point.
function fractionToPercent(value: number): number {
  return Math.round(value * 100 * 1e6) / 1e6;
}

type StoreConfigInput = Partial<Omit<StoreConfig, "pricing" | "recommendations">> &
  Pick<StoreConfig, "id" | "name" | "tagline"> & {
    pricing?: Partial<StorePricing>;
    recommendations?: Partial<StoreRecommendations>;
  };

export function createStoreConfig(input: StoreConfigInput): StoreConfig {
  const market = input.market ?? DEFAULTS.market;
  const language = input.language ?? DEFAULTS.language;
  const targetMarginPercent =
    input.pricing?.targetMarginPercent ??
    (input.targetMargin !== undefined ? fractionToPercent(input.targetMargin) : DEFAULTS.targetMarginPercent);
  const maxDeliveryDays =
    input.recommendations?.maxDeliveryDays ?? input.maxDeliveryDays ?? DEFAULTS.maxDeliveryDays;

  return {
    supplierStrategy: DEFAULTS.supplierStrategy,
    approvalRequired: DEFAULTS.approvalRequired,
    currency: DEFAULTS.currency,
    ...input,
    market,
    language,
    locale: input.locale ?? defaultLocale(language, market),
    targetMargin: targetMarginPercent / 100,
    maxDeliveryDays,
    pricing: {
      targetMarginPercent,
      minimumMarginPercent: input.pricing?.minimumMarginPercent ?? DEFAULTS.minimumMarginPercent,
      pricesIncludeVat: input.pricing?.pricesIncludeVat ?? DEFAULTS.pricesIncludeVat,
      vatRatePercent: input.pricing?.vatRatePercent ?? DEFAULTS.vatRatePercent
    },
    recommendations: { maxDeliveryDays }
  };
}

export class StoreConfigError extends Error {
  constructor(readonly slug: string, readonly issues: string[]) {
    super(`Nieprawidłowa konfiguracja sklepu "${slug}":\n- ${issues.join("\n- ")}`);
    this.name = "StoreConfigError";
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MIN_AGE = 13;
const MAX_AGE = 120;

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Collects every problem instead of stopping at the first one.
class Checker {
  readonly issues: string[] = [];

  fail(path: string, message: string) {
    this.issues.push(`${path}: ${message}`);
  }

  string(raw: Raw, key: string, path: string, required: boolean): string | undefined {
    const value = raw[key];
    if (value === undefined) {
      if (required) this.fail(path, "pole jest wymagane");
      return undefined;
    }
    if (typeof value !== "string" || !value.trim()) {
      this.fail(path, "musi być niepustym tekstem");
      return undefined;
    }
    return value.trim();
  }

  boolean(raw: Raw, key: string, path: string): boolean | undefined {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") {
      this.fail(path, "musi być wartością true/false");
      return undefined;
    }
    return value;
  }

  number(raw: Raw, key: string, path: string, opts: { min: number; max: number; maxExclusive?: boolean; integer?: boolean }): number | undefined {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.fail(path, "musi być liczbą");
      return undefined;
    }
    if (opts.integer && !Number.isInteger(value)) {
      this.fail(path, `musi być liczbą całkowitą (jest ${value})`);
      return undefined;
    }
    const aboveMax = opts.maxExclusive ? value >= opts.max : value > opts.max;
    if (value < opts.min || aboveMax) {
      this.fail(path, `musi być w zakresie ${opts.min}–${opts.max}${opts.maxExclusive ? " (bez " + opts.max + ")" : ""} (jest ${value})`);
      return undefined;
    }
    return value;
  }

  stringArray(raw: Raw, key: string, path: string): string[] | undefined {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
      this.fail(path, "musi być listą niepustych tekstów");
      return undefined;
    }
    const items = value.map((item: string) => item.trim());
    const duplicates = items.filter((item, index) => items.indexOf(item) !== index);
    if (duplicates.length) {
      this.fail(path, `zawiera duplikaty: ${[...new Set(duplicates)].join(", ")}`);
    }
    return items;
  }

  object(raw: Raw, key: string, path: string): Raw | undefined {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (!isObject(value)) {
      this.fail(path, "musi być obiektem");
      return undefined;
    }
    return value;
  }
}

function parseAgeRange(value: string): [number, number] | null {
  const match = /^(\d{1,3})-(\d{1,3})$/.exec(value);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

// Validates a raw store config (as read from stores/<slug>/store.config.*),
// applies defaults and migrates legacy fields. Throws StoreConfigError listing all problems.
export function parseStoreConfig(raw: unknown, slug: string): StoreConfig {
  const c = new Checker();

  if (!SLUG_PATTERN.test(slug)) {
    throw new StoreConfigError(slug, [`slug: nieprawidłowy identyfikator sklepu "${slug}"`]);
  }

  if (!isObject(raw)) {
    throw new StoreConfigError(slug, ["konfiguracja musi być obiektem"]);
  }

  const id = c.string(raw, "id", "id", true);
  const name = c.string(raw, "name", "name", true);
  const tagline = c.string(raw, "tagline", "tagline", true);

  const configSlug = c.string(raw, "slug", "slug", false);
  if (configSlug !== undefined && configSlug !== slug) {
    c.fail("slug", `"${configSlug}" nie zgadza się z katalogiem sklepu "${slug}"`);
  }

  const market = c.string(raw, "market", "market", false) ?? DEFAULTS.market;
  if (!/^(?:[A-Z]{2}|EU)$/.test(market)) {
    c.fail("market", `musi być kodem kraju (np. PL) lub EU (jest "${market}")`);
  }

  const currencyRaw = c.string(raw, "currency", "currency", false) ?? DEFAULTS.currency;
  const currency = currencyRaw.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    c.fail("currency", `musi być 3-literowym kodem waluty (jest "${currencyRaw}")`);
  }

  const language = c.string(raw, "language", "language", false) ?? DEFAULTS.language;
  if (!/^[a-z]{2,3}$/.test(language)) {
    c.fail("language", `musi być kodem języka, np. "pl" (jest "${language}")`);
  }

  const locale = c.string(raw, "locale", "locale", false) ?? defaultLocale(language, market);
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) {
    c.fail("locale", `musi mieć format np. "pl-PL" (jest "${locale}")`);
  } else if (locale.split("-")[0] !== language) {
    c.fail("locale", `"${locale}" nie pasuje do języka "${language}"`);
  }

  const supplierStrategy = c.string(raw, "supplierStrategy", "supplierStrategy", false) ?? DEFAULTS.supplierStrategy;
  const approvalRequired = c.boolean(raw, "approvalRequired", "approvalRequired") ?? DEFAULTS.approvalRequired;
  const niche = c.string(raw, "niche", "niche", false);

  // Pricing: pricing.* wins; legacy targetMargin (fraction 0–1) is migrated.
  const legacyTargetMargin = c.number(raw, "targetMargin", "targetMargin", { min: 0, max: 1, maxExclusive: true });
  const pricingRaw = c.object(raw, "pricing", "pricing") ?? {};
  const pricingTarget = c.number(pricingRaw, "targetMarginPercent", "pricing.targetMarginPercent", { min: 0, max: 100, maxExclusive: true });
  const legacyTargetPercent = legacyTargetMargin !== undefined ? fractionToPercent(legacyTargetMargin) : undefined;

  if (pricingTarget !== undefined && legacyTargetPercent !== undefined && pricingTarget !== legacyTargetPercent) {
    c.fail("targetMargin", `${legacyTargetMargin} (${legacyTargetPercent}%) jest sprzeczne z pricing.targetMarginPercent (${pricingTarget}%)`);
  }

  const targetMarginPercent = pricingTarget ?? legacyTargetPercent ?? DEFAULTS.targetMarginPercent;
  const minimumMarginPercent =
    c.number(pricingRaw, "minimumMarginPercent", "pricing.minimumMarginPercent", { min: 0, max: 100, maxExclusive: true }) ??
    DEFAULTS.minimumMarginPercent;

  if (minimumMarginPercent > targetMarginPercent) {
    c.fail("pricing.minimumMarginPercent", `(${minimumMarginPercent}%) nie może być większe niż marża docelowa (${targetMarginPercent}%)`);
  }

  const pricesIncludeVat = c.boolean(pricingRaw, "pricesIncludeVat", "pricing.pricesIncludeVat") ?? DEFAULTS.pricesIncludeVat;
  const vatRatePercent =
    c.number(pricingRaw, "vatRatePercent", "pricing.vatRatePercent", { min: 0, max: 100, maxExclusive: true }) ??
    DEFAULTS.vatRatePercent;

  if (pricesIncludeVat && vatRatePercent <= 0) {
    c.fail("pricing.vatRatePercent", "musi być większe od 0, gdy pricesIncludeVat = true");
  }

  // Delivery: recommendations.maxDeliveryDays wins over legacy maxDeliveryDays.
  const deliveryLimits = { min: 1, max: 365, integer: true };
  const legacyMaxDelivery = c.number(raw, "maxDeliveryDays", "maxDeliveryDays", deliveryLimits);
  const recommendationsRaw = c.object(raw, "recommendations", "recommendations") ?? {};
  const recommendedMaxDelivery = c.number(recommendationsRaw, "maxDeliveryDays", "recommendations.maxDeliveryDays", deliveryLimits);

  if (recommendedMaxDelivery !== undefined && legacyMaxDelivery !== undefined && recommendedMaxDelivery !== legacyMaxDelivery) {
    c.fail("maxDeliveryDays", `${legacyMaxDelivery} jest sprzeczne z recommendations.maxDeliveryDays (${recommendedMaxDelivery})`);
  }

  const maxDeliveryDays = recommendedMaxDelivery ?? legacyMaxDelivery ?? DEFAULTS.maxDeliveryDays;

  // Audience = customers' age, independent of the persona's age.
  let audience: StoreAudience | undefined;
  const audienceRaw = c.object(raw, "audience", "audience");

  if (audienceRaw) {
    const ageLimits = { min: MIN_AGE, max: MAX_AGE, integer: true };
    const ageMin = c.number(audienceRaw, "ageMin", "audience.ageMin", ageLimits);
    const ageMax = c.number(audienceRaw, "ageMax", "audience.ageMax", ageLimits);
    const description = c.string(audienceRaw, "description", "audience.description", false);

    if (audienceRaw.ageMin === undefined) c.fail("audience.ageMin", "pole jest wymagane");
    if (audienceRaw.ageMax === undefined) c.fail("audience.ageMax", "pole jest wymagane");

    if (ageMin !== undefined && ageMax !== undefined) {
      if (ageMin > ageMax) {
        c.fail("audience", `ageMin (${ageMin}) nie może być większe niż ageMax (${ageMax})`);
      }
      audience = { ageMin, ageMax, ...(description ? { description } : {}) };
    }
  }

  // Catalog structure: categories ⊇ subcategory groups, subcategories ⊇ coverage targets.
  const productCategories = c.stringArray(raw, "productCategories", "productCategories");
  let productSubcategories: Record<string, string[]> | undefined;
  const subcategoriesRaw = c.object(raw, "productSubcategories", "productSubcategories");

  if (subcategoriesRaw) {
    productSubcategories = {};
    const seen = new Map<string, string>();

    for (const category of Object.keys(subcategoriesRaw)) {
      const items = c.stringArray(subcategoriesRaw, category, `productSubcategories.${category}`);

      if (productCategories && !productCategories.includes(category)) {
        c.fail(`productSubcategories.${category}`, "kategoria nie występuje w productCategories");
      } else if (!productCategories) {
        c.fail(`productSubcategories.${category}`, "wymaga zdefiniowania productCategories");
      }

      for (const item of items ?? []) {
        const owner = seen.get(item);
        if (owner && owner !== category) {
          c.fail(`productSubcategories.${category}`, `podkategoria "${item}" występuje też w "${owner}"`);
        }
        seen.set(item, category);
      }

      if (items) productSubcategories[category] = items;
    }
  }

  let catalogCoverage: StoreConfig["catalogCoverage"];
  const coverageRaw = c.object(raw, "catalogCoverage", "catalogCoverage");

  if (coverageRaw) {
    catalogCoverage = {};
    const allSubcategories = new Set(Object.values(productSubcategories ?? {}).flat());

    for (const [subcategory, rule] of Object.entries(coverageRaw)) {
      const path = `catalogCoverage.${subcategory}`;

      if (!productSubcategories) {
        c.fail(path, "wymaga zdefiniowania productSubcategories");
      } else if (!allSubcategories.has(subcategory)) {
        c.fail(path, "podkategoria nie występuje w productSubcategories");
      }

      if (!isObject(rule)) {
        c.fail(path, "musi być obiektem { minimumProducts }");
        continue;
      }

      if (rule.minimumProducts === undefined) {
        c.fail(`${path}.minimumProducts`, "pole jest wymagane");
        continue;
      }

      const minimumProducts = c.number(rule, "minimumProducts", `${path}.minimumProducts`, { min: 0, max: 100_000, integer: true });
      if (minimumProducts !== undefined) catalogCoverage[subcategory] = { minimumProducts };
    }
  }

  let catalog: StoreConfig["catalog"];
  const catalogRaw = c.object(raw, "catalog", "catalog");

  if (catalogRaw) {
    catalog = {
      shopifyVendor: c.string(catalogRaw, "shopifyVendor", "catalog.shopifyVendor", false),
      excludeProductTypes: c.stringArray(catalogRaw, "excludeProductTypes", "catalog.excludeProductTypes"),
      requiredTags: c.stringArray(catalogRaw, "requiredTags", "catalog.requiredTags"),
      requireAvailable: c.boolean(catalogRaw, "requireAvailable", "catalog.requireAvailable")
    };
  }

  let brand: StoreConfig["brand"];
  const brandRaw = c.object(raw, "brand", "brand");

  if (brandRaw) {
    const color = (key: string) => {
      const value = c.string(brandRaw, key, `brand.${key}`, false);
      if (value !== undefined && !HEX_COLOR_PATTERN.test(value)) {
        c.fail(`brand.${key}`, `musi być kolorem HEX, np. #F4EFE7 (jest "${value}")`);
        return undefined;
      }
      return value;
    };

    brand = {
      primaryColor: color("primaryColor"),
      secondaryColor: color("secondaryColor"),
      style: c.string(brandRaw, "style", "brand.style", false),
      voice: c.string(brandRaw, "voice", "brand.voice", false)
    };
  }

  let aiInfluencer: StoreConfig["aiInfluencer"];
  const influencerRaw = c.object(raw, "aiInfluencer", "aiInfluencer");

  if (influencerRaw) {
    const enabled = c.boolean(influencerRaw, "enabled", "aiInfluencer.enabled");
    if (enabled === undefined && influencerRaw.enabled === undefined) {
      c.fail("aiInfluencer.enabled", "pole jest wymagane");
    }

    const ageRange = c.string(influencerRaw, "ageRange", "aiInfluencer.ageRange", false);
    if (ageRange !== undefined) {
      const range = parseAgeRange(ageRange);
      if (!range) {
        c.fail("aiInfluencer.ageRange", `musi mieć format "30-35" (jest "${ageRange}")`);
      } else if (range[0] > range[1] || range[0] < MIN_AGE || range[1] > MAX_AGE) {
        c.fail("aiInfluencer.ageRange", `nieprawidłowy zakres wieku "${ageRange}"`);
      }
    }

    aiInfluencer = {
      enabled: enabled ?? false,
      name: c.string(influencerRaw, "name", "aiInfluencer.name", false),
      ageRange,
      personality: c.stringArray(influencerRaw, "personality", "aiInfluencer.personality")
    };
  }

  if (c.issues.length) {
    throw new StoreConfigError(slug, c.issues);
  }

  return withoutUndefined({
    id: id!,
    slug,
    name: name!,
    tagline: tagline!,
    market,
    currency,
    language,
    locale,
    supplierStrategy,
    targetMargin: targetMarginPercent / 100,
    maxDeliveryDays,
    approvalRequired,
    pricing: { targetMarginPercent, minimumMarginPercent, pricesIncludeVat, vatRatePercent },
    recommendations: { maxDeliveryDays },
    audience,
    niche,
    productCategories,
    productSubcategories,
    catalogCoverage,
    catalog: catalog && withoutUndefined(catalog),
    brand: brand && withoutUndefined(brand),
    aiInfluencer: aiInfluencer && withoutUndefined(aiInfluencer)
  });
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

// Internal pricing (margins, VAT) must not leave the backend; legacy
// targetMargin carries the same information, so it is removed too.
export type PublicStoreConfig = Omit<StoreConfig, "pricing" | "targetMargin">;

export function toPublicStoreConfig(config: StoreConfig): PublicStoreConfig {
  const { pricing: _pricing, targetMargin: _targetMargin, ...publicConfig } = config;
  return publicConfig;
}


export type StoreProposal = {
  id: string;
  name: string;
  tagline: string;
  niche: string;
  productCategories: string[];
  brand: NonNullable<StoreConfig["brand"]>;
  aiInfluencer: NonNullable<StoreConfig["aiInfluencer"]>;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export function createStoreProposal(input: Omit<StoreProposal, "id" | "status" | "createdAt">): StoreProposal {
  return {
    ...input,
    id: crypto.randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString()
  };
}
