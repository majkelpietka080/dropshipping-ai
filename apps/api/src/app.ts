import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import {
  type StoreProposal
} from '@dropshipping/stores';
import { loadJsonArray } from './storage.js';
import {
  publicErrorDetails,
  redactUrlForLogs,
  registerAdminAuth,
  resolveCorsOrigins
} from './security.js';
import { OAuthStateStore } from './allegro-oauth.js';
import {
  InFlightGuard
} from './product-approval.js';
import {
  resolveDefaultStoreSlug
} from './store-settings.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerStoreConfigRoutes } from './routes/store-config.js';
import { registerAllegroRoutes } from './routes/allegro.js';
import { registerShopifyRoutes } from './routes/shopify.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerStorefrontRoutes } from './routes/storefront.js';
import { registerSupplierRoutes } from './routes/suppliers.js';
import { registerStoreProposalRoutes } from './routes/store-proposals.js';
import { registerProductProposalRoutes } from './routes/product-proposals.js';
import { registerCustomerNeedRoutes } from './routes/customer-needs.js';
import { registerProductScoutRoutes } from './routes/product-scout.js';
import {
  customerNeedSearches,
  customerNeeds,
  productApprovals,
  productProposals
} from './state.js';

// Computed here, after dotenv.config(), so .env values are visible.
const DEFAULT_STORE_SLUG = resolveDefaultStoreSlug();

export const app = Fastify({
  logger: {
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: redactUrlForLogs(request.url),
          remoteAddress: request.ip
        };
      }
    }
  }
});

export const corsOrigins = resolveCorsOrigins();

await app.register(cors, {
  origin: (origin, callback) => {
    callback(null, origin !== undefined && corsOrigins.has(origin));
  }
});

// Registered before any route so every non-public route gets the admin check.
registerAdminAuth(app);

app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error(error);

  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

  return reply.code(statusCode).send({
    ok: false,
    error: statusCode < 500 ? publicErrorDetails(error) : 'Wewnętrzny błąd serwera.'
  });
});

const allegroStates = new OAuthStateStore();
const isSecureCookie = (process.env.ALLEGRO_REDIRECT_URI ?? '').startsWith('https://');

registerAllegroRoutes(app, { allegroStates, isSecureCookie });

registerSystemRoutes(app);

registerAiRoutes(app);


registerShopifyRoutes(app, { defaultStoreSlug: DEFAULT_STORE_SLUG });

registerCatalogRoutes(app, { defaultStoreSlug: DEFAULT_STORE_SLUG });
registerStorefrontRoutes(app, { defaultStoreSlug: DEFAULT_STORE_SLUG });

const storeProposals = new Map<string, StoreProposal>(
  (await loadJsonArray<StoreProposal>('store-proposals.json')).map((item) => [item.id, item])
);

const storeProposalOperations = new InFlightGuard();

registerStoreProposalRoutes(app, { storeProposals, storeProposalOperations });

registerProductProposalRoutes(app, {
  productProposals,
  productApprovals,
  defaultStoreSlug: DEFAULT_STORE_SLUG
});

registerSupplierRoutes(app);

registerStoreConfigRoutes(app, { defaultStoreSlug: DEFAULT_STORE_SLUG });

registerProductScoutRoutes(app, {
  productProposals,
  defaultStoreSlug: DEFAULT_STORE_SLUG
});

registerCustomerNeedRoutes(app, {
  customerNeeds,
  customerNeedSearches,
  productProposals,
  defaultStoreSlug: DEFAULT_STORE_SLUG
});
