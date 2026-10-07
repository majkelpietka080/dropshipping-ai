import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StoreConfigError,
  buildCatalogTaxonomy,
  classifyProductType,
  normalizeTaxonomyKey,
  parseStoreConfig,
  taxonomySlug
} from '../src/index.js';
import { minimalConfig, readStoreFile } from './helpers.js';

const giovetta = parseStoreConfig(await readStoreFile('giovetta-living'), 'giovetta-living');
const taxonomy = buildCatalogTaxonomy(giovetta);

const CATEGORIES = ['Home & Living', 'Travel & Organization', 'Lifestyle', 'Fashion & Accessories'];

function issuesOf(raw: unknown): string[] {
  try {
    parseStoreConfig(raw, 'test-store');
  } catch (error) {
    assert.ok(error instanceof StoreConfigError);
    return error.issues;
  }
  assert.fail('expected StoreConfigError');
}

test('every Giovetta subcategory maps to its own category', () => {
  let count = 0;

  for (const [category, subcategories] of Object.entries(giovetta.productSubcategories ?? {})) {
    for (const subcategory of subcategories) {
      const result = classifyProductType(subcategory, taxonomy);

      assert.equal(result.matchedBy, 'subcategory', subcategory);
      assert.equal(result.category, category, subcategory);
      assert.equal(result.subcategory, subcategory);
      count++;
    }
  }

  assert.equal(count, 37);
});

test('the 4 Giovetta categories map with subcategory = null', () => {
  assert.deepEqual(taxonomy.categories.map((category) => category.name), CATEGORIES);

  for (const category of CATEGORIES) {
    const result = classifyProductType(category, taxonomy);

    assert.equal(result.matchedBy, 'category');
    assert.equal(result.category, category);
    assert.equal(result.subcategory, null);
    assert.equal(result.subcategorySlug, null);
  }
});

test('case, whitespace and Unicode NFD do not break matching', () => {
  const cases: Array<[string, string, string]> = [
    ['  oświetlenie  ', 'Home & Living', 'Oświetlenie'],
    ['ODZIEŻ   DAMSKA', 'Fashion & Accessories', 'Odzież damska'],
    ['Biżuteria'.normalize('NFD'), 'Fashion & Accessories', 'Biżuteria'],
    ['Akcesoria łazienkowe'.normalize('NFD').toUpperCase(), 'Home & Living', 'Akcesoria łazienkowe'],
    ['\tTorby\npodróżne ', 'Travel & Organization', 'Torby podróżne'],
    ['bielizna', 'Fashion & Accessories', 'Bielizna']
  ];

  for (const [input, category, subcategory] of cases) {
    const result = classifyProductType(input, taxonomy);
    assert.equal(result.category, category, JSON.stringify(input));
    assert.equal(result.subcategory, subcategory, JSON.stringify(input));
  }

  assert.equal(classifyProductType('home & living', taxonomy).category, 'Home & Living');
  assert.equal(normalizeTaxonomyKey('Gadżety'.normalize('NFD')), normalizeTaxonomyKey('gadżety'));
});

test('slugs are stable, ASCII and unique', () => {
  assert.deepEqual(taxonomy.categories.map((category) => category.slug), [
    'home-living', 'travel-organization', 'lifestyle', 'fashion-accessories'
  ]);

  const expected: Record<string, string> = {
    'Łazienka': 'lazienka',
    'Akcesoria łazienkowe': 'akcesoria-lazienkowe',
    'Organizacja łazienki': 'organizacja-lazienki',
    'Oświetlenie': 'oswietlenie',
    'Torby podróżne': 'torby-podrozne',
    'Gadżety': 'gadzety',
    'Produkty codziennego użytku': 'produkty-codziennego-uzytku',
    'Odzież damska': 'odziez-damska',
    'Biżuteria': 'bizuteria',
    'Bielizna': 'bielizna'
  };

  for (const [name, slug] of Object.entries(expected)) {
    assert.equal(taxonomySlug(name), slug, name);
    assert.equal(taxonomySlug(name.normalize('NFD')), slug, `${name} (NFD)`);
    assert.equal(classifyProductType(name, taxonomy).subcategorySlug, slug);
  }

  const all = taxonomy.categories.flatMap((category) => [category.slug, ...category.subcategories.map((sub) => sub.slug)]);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)));
});

test('unknown or empty values are not classified', () => {
  for (const value of ['Car Lifestyle', 'Other', 'Organizer', '', '   ', null, undefined]) {
    assert.deepEqual(classifyProductType(value, taxonomy), {
      matchedBy: 'none',
      category: null,
      categorySlug: null,
      subcategory: null,
      subcategorySlug: null
    }, String(value));
  }
});

test('taxonomy name collisions after normalization are rejected', () => {
  // case
  assert.ok(issuesOf(minimalConfig({ productCategories: ['Home', 'HOME'] })).some((i) => i.includes('koliduje')));
  // Unicode NFC vs NFD across categories
  assert.ok(issuesOf(minimalConfig({
    productCategories: ['A', 'B'],
    productSubcategories: { A: ['Biżuteria'], B: ['Biżuteria'.normalize('NFD')] }
  })).some((i) => i.includes('koliduje')));
  // subcategory with the same name as a category
  assert.ok(issuesOf(minimalConfig({
    productCategories: ['Lifestyle'],
    productSubcategories: { Lifestyle: ['lifestyle'] }
  })).some((i) => i.includes('koliduje')));
  // different names, same slug
  assert.ok(issuesOf(minimalConfig({ productCategories: ['Home & Living', 'Home Living'] })).some((i) => i.includes('ten sam slug')));
  // no usable slug
  assert.ok(issuesOf(minimalConfig({ productCategories: ['&&&'] })).some((i) => i.includes('sluga')));
});

test('existing store configs still pass the stricter validation', async () => {
  assert.doesNotThrow(() => parseStoreConfig(giovetta, 'giovetta-living'));
  const casaVerde = await readStoreFile('casa-verde-2');
  assert.doesNotThrow(() => parseStoreConfig(casaVerde, 'casa-verde-2'));
});
