export const storeConfig = {
  "id": "giovetta-living",
  "slug": "giovetta-living",
  "name": "Giovetta Living",
  "tagline": "La vita, con stile",
  "market": "PL",
  "currency": "PLN",
  "language": "pl",
  "locale": "pl-PL",
  "niche": "smart living i lifestyle",
  "pricing": {
    "targetMarginPercent": 55,
    "minimumMarginPercent": 20,
    "pricesIncludeVat": true,
    "vatRatePercent": 23
  },
  "recommendations": {
    "maxDeliveryDays": 10
  },
  "audience": {
    "ageMin": 25,
    "ageMax": 60
  },
  "productCategories": [
    "Home & Living",
    "Travel & Organization",
    "Lifestyle",
    "Fashion & Accessories"
  ],

  "productSubcategories": {
    "Home & Living": [
      "Łazienka",
      "Baterie umywalkowe",
      "Baterie wannowe",
      "Prysznice",
      "Akcesoria łazienkowe",
      "Organizacja łazienki",
      "Kuchnia",
      "Baterie kuchenne",
      "Organizacja kuchni",
      "Akcesoria kuchenne",
      "Przechowywanie",
      "Oświetlenie",
      "Dekoracje",
      "Organizacja domu",
      "Tekstylia",
      "Meble i dodatki"
    ],
    "Travel & Organization": [
      "Walizki",
      "Torby podróżne",
      "Plecaki",
      "Organizery",
      "Akcesoria podróżne",
      "Akcesoria samochodowe",
      "Organizacja pracy"
    ],
    "Lifestyle": [
      "Wellness",
      "Fitness",
      "Beauty",
      "Gadżety",
      "Hobby",
      "Produkty codziennego użytku"
    ],
    "Fashion & Accessories": [
      "Odzież damska",
      "Bielizna",
      "Torebki",
      "Biżuteria",
      "Okulary",
      "Paski",
      "Buty",
      "Dodatki"
    ]
  },
  "catalogCoverage": {
    "Łazienka": { "minimumProducts": 50 },
    "Baterie umywalkowe": { "minimumProducts": 50 },
    "Baterie wannowe": { "minimumProducts": 40 },
    "Prysznice": { "minimumProducts": 50 },
    "Akcesoria łazienkowe": { "minimumProducts": 40 },
    "Organizacja łazienki": { "minimumProducts": 40 },
    "Kuchnia": { "minimumProducts": 50 },
    "Baterie kuchenne": { "minimumProducts": 50 },
    "Organizacja kuchni": { "minimumProducts": 40 },
    "Akcesoria kuchenne": { "minimumProducts": 40 },
    "Przechowywanie": { "minimumProducts": 50 },
    "Oświetlenie": { "minimumProducts": 40 },
    "Dekoracje": { "minimumProducts": 40 },
    "Organizacja domu": { "minimumProducts": 50 },
    "Tekstylia": { "minimumProducts": 40 },
    "Meble i dodatki": { "minimumProducts": 30 },
    "Walizki": { "minimumProducts": 50 },
    "Torby podróżne": { "minimumProducts": 50 },
    "Plecaki": { "minimumProducts": 50 },
    "Organizery": { "minimumProducts": 50 },
    "Akcesoria podróżne": { "minimumProducts": 40 },
    "Akcesoria samochodowe": { "minimumProducts": 50 },
    "Organizacja pracy": { "minimumProducts": 40 },
    "Wellness": { "minimumProducts": 40 },
    "Fitness": { "minimumProducts": 40 },
    "Beauty": { "minimumProducts": 50 },
    "Gadżety": { "minimumProducts": 50 },
    "Hobby": { "minimumProducts": 30 },
    "Produkty codziennego użytku": { "minimumProducts": 50 },
    "Odzież damska": { "minimumProducts": 50 },
    "Bielizna": { "minimumProducts": 50 },
    "Torebki": { "minimumProducts": 50 },
    "Biżuteria": { "minimumProducts": 50 },
    "Okulary": { "minimumProducts": 40 },
    "Paski": { "minimumProducts": 30 },
    "Buty": { "minimumProducts": 50 },
    "Dodatki": { "minimumProducts": 40 }
  },
  "catalog": {
    "shopifyVendor": "GIOVETTA LIVING",
    "excludeProductTypes": ["snowboard"],
    "requiredTags": ["giovetta"],
    "requireAvailable": true
  },
  "brand": {
    "primaryColor": "#F4EFE7",
    "secondaryColor": "#2B211B",
    "style": "elegant, modern, smart casual"
  },
  "aiInfluencer": {
    "enabled": true,
    "name": "Giovetta",
    "ageRange": "30-35",
    "personality": [
      "inteligentna",
      "pewna siebie",
      "smart casual",
      "lekko ironiczna"
    ]
  }
} as const;
