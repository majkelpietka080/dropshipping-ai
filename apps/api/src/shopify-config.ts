import type { ShopifyConfig, ShopifyStorefrontConfig } from '@dropshipping/shopify';

export function getShopifyConfig(): ShopifyConfig | null {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shopDomain || !clientId || !clientSecret) {
    return null;
  }

  return { shopDomain, clientId, clientSecret };
}

export function getShopifyStorefrontConfig(): ShopifyStorefrontConfig | null {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    return null;
  }

  return { shopDomain, accessToken };
}
