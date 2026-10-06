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

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

function normalizeShopDomain(shopDomain: string): string {
  return shopDomain
    .replace(/^https?:\/\//, '')
    .replace(/\.myshopify\.com\/?$/, '')
    .replace(/\/$/, '');
}

async function getAccessToken(config: ShopifyConfig): Promise<string> {
  const domain = normalizeShopDomain(config.shopDomain);
  const cacheKey = `${domain}:${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.accessToken;
  }

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

  const accessToken = body.access_token as string | undefined;
  const expiresIn = body.expires_in as number | undefined;
  if (!accessToken || !expiresIn) {
    throw new Error('Shopify token response is missing access_token or expires_in.');
  }

  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000
  });

  return accessToken;
}

export async function createShopifyProduct(
  config: ShopifyConfig,
  input: {
    title: string;
    description?: string;
    vendor?: string;
    productType?: string;
    price?: number;
  }
) {
  const client = createShopifyClient(config);

  const mutation = `
    mutation productCreate($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product {
          id
          title
          status
          variants(first: 1) {
            nodes {
              id
              price
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await client.query<{
    productCreate: {
      product: {
        id: string;
        title: string;
        status: string;
        variants: { nodes: Array<{ id: string; price: string }> };
      } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(mutation, {
    product: {
      title: input.title,
      descriptionHtml: input.description ?? '',
      vendor: input.vendor ?? 'GIOVETTA LIVING',
      productType: input.productType ?? '',
      tags: ['giovetta'],
      status: 'DRAFT'
    }
  });

  if (result.productCreate.userErrors.length) {
    throw new Error(`Shopify productCreate error: ${JSON.stringify(result.productCreate.userErrors)}`);
  }

  const product = result.productCreate.product;

  if (input.price !== undefined && product?.id && product.variants.nodes[0]?.id) {
    const priceResult = await client.query<{
      productVariantsBulkUpdate: {
        productVariants: Array<{ id: string; price: string }>;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>(`
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      productId: product.id,
      variants: [{ id: product.variants.nodes[0].id, price: input.price }]
    });

    if (priceResult.productVariantsBulkUpdate.userErrors.length) {
      throw new Error(`Shopify variant price error: ${JSON.stringify(priceResult.productVariantsBulkUpdate.userErrors)}`);
    }

    return {
      ...result.productCreate,
      priceUpdate: priceResult.productVariantsBulkUpdate
    };
  }

  return result.productCreate;
}


export async function setShopifyProductInventory(
  config: ShopifyConfig,
  productId: string,
  quantity: number
) {
  const client = createShopifyClient(config);

  const productResult = await client.query<{
    product: {
      variants: {
        nodes: Array<{
          inventoryItem: { id: string };
        }>;
      };
    } | null;
  }>(`
    query productInventoryItem($id: ID!) {
      product(id: $id) {
        variants(first: 1) {
          nodes {
            inventoryItem {
              id
            }
          }
        }
      }
    }
  `, { id: productId });

  const inventoryItemId =
    productResult.product?.variants.nodes[0]?.inventoryItem.id;

  if (!inventoryItemId) {
    throw new Error(`Nie znaleziono inventory item dla produktu ${productId}.`);
  }

  const locationsResult = await client.query<{
    locations: {
      nodes: Array<{ id: string }>;
    };
  }>(`
    query inventoryLocations {
      locations(first: 10) {
        nodes {
          id
        }
      }
    }
  `);

  const locationId = locationsResult.locations.nodes[0]?.id;

  if (!locationId) {
    throw new Error('Nie znaleziono lokalizacji magazynowej Shopify.');
  }

  const result = await client.query<{
    inventorySetQuantities: {
      inventoryAdjustmentGroup: {
        createdAt: string;
      } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(`
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    input: {
      name: 'available',
      reason: 'correction',
      ignoreCompareQuantity: true,
      quantities: [
        {
          inventoryItemId,
          locationId,
          quantity: Math.max(0, Math.floor(quantity))
        }
      ]
    }
  });

  if (result.inventorySetQuantities.userErrors.length) {
    throw new Error(
      result.inventorySetQuantities.userErrors
        .map((error) => error.message)
        .join("; ")
    );
  }

  return result.inventorySetQuantities;
}

export async function tagShopifyProduct(
  config: ShopifyConfig,
  productId: string,
  tags: string[]
) {
  const client = createShopifyClient(config);
  const result = await client.query<{
    productUpdate: {
      product: { id: string; title: string; status: string; tags: string[] } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(`
    mutation productUpdate($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product {
          id
          title
          status
          tags
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { product: { id: productId, tags } });

  if (result.productUpdate.userErrors.length) {
    throw new Error(
      result.productUpdate.userErrors.map((error) => error.message).join("; ")
    );
  }

  return result.productUpdate;
}

export function createShopifyClient(config: ShopifyConfig) {
  const domain = normalizeShopDomain(config.shopDomain);

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
