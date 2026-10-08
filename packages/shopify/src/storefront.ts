export type ShopifyStorefrontConfig = {
  shopDomain: string;
  accessToken: string;
};

const API_VERSION = '2026-07';

function normalizeShopDomain(shopDomain: string): string {
  return shopDomain
    .replace(/^https?:\/\//, '')
    .replace(/\.myshopify\.com\/?$/, '')
    .replace(/\/$/, '');
}

export type StorefrontCartLine = {
  merchandiseId: string;
  quantity: number;
};

export type StorefrontCartResult = {
  cartId: string;
  checkoutUrl: string;
};

export async function createShopifyCart(
  config: ShopifyStorefrontConfig,
  lines: StorefrontCartLine[]
): Promise<StorefrontCartResult> {
  const domain = normalizeShopDomain(config.shopDomain);

  const response = await fetch(
    `https://${domain}.myshopify.com/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': config.accessToken
      },
      body: JSON.stringify({
        query: `
          mutation cartCreate($input: CartInput!) {
            cartCreate(input: $input) {
              cart {
                id
                checkoutUrl
              }
              userErrors {
                field
                message
                code
              }
              warnings {
                code
                message
              }
            }
          }
        `,
        variables: {
          input: {
            lines: lines.map((line) => ({
              merchandiseId: line.merchandiseId,
              quantity: line.quantity
            }))
          }
        }
      })
    }
  );

  const body = await response.json() as {
    data?: {
      cartCreate?: {
        cart?: { id: string; checkoutUrl: string } | null;
        userErrors?: Array<{ field?: string[]; message: string; code?: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (!response.ok) {
    throw new Error(`Shopify Storefront API HTTP ${response.status}`);
  }

  if (body.errors?.length) {
    throw new Error(`Shopify Storefront GraphQL error: ${JSON.stringify(body.errors)}`);
  }

  const payload = body.data?.cartCreate;
  if (!payload) {
    throw new Error('Shopify Storefront API returned no cartCreate payload.');
  }

  if (payload.userErrors?.length) {
    throw new Error(
      payload.userErrors.map((error) => error.message).join('; ')
    );
  }

  if (!payload.cart?.id || !payload.cart.checkoutUrl) {
    throw new Error('Shopify Storefront API returned an incomplete cart.');
  }

  return {
    cartId: payload.cart.id,
    checkoutUrl: payload.cart.checkoutUrl
  };
}
