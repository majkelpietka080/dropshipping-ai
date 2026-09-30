export type ShopifyConfig = {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
};

export type ShopifyTool =
  | 'get_products'
  | 'get_order'
  | 'get_inventory'
  | 'get_customer';

const API_VERSION = '2026-07';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(config: ShopifyConfig): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken!;
  }

  const domain = config.shopDomain
    .replace(/^https?:\/\//, '')
    .replace(/\.myshopify\.com\/?$/, '')
    .replace(/\/$/, '');

  const response = await fetch(
    `https://${domain}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret
      })
    }
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `Shopify token request failed: HTTP ${response.status}`
    );
  }

  cachedToken = body.access_token;
  tokenExpiresAt = Date.now() + body.expires_in * 1000;

  return cachedToken!;
}

export function createShopifyClient(config: ShopifyConfig) {
  const domain = config.shopDomain
    .replace(/^https?:\/\//, '')
    .replace(/\.myshopify\.com\/?$/, '')
    .replace(/\/$/, '');

  return {
    async query<T = unknown>(
      query: string,
      variables?: Record<string, unknown>
    ): Promise<T> {
      const accessToken = await getAccessToken(config);

      const response = await fetch(
        `https://${domain}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          },
          body: JSON.stringify({ query, variables })
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          `Shopify API HTTP ${response.status}`
        );
      }

      if (body.errors?.length) {
        throw new Error(
          `Shopify GraphQL error: ${JSON.stringify(body.errors)}`
        );
      }

      return body.data as T;
    }
  };
}
