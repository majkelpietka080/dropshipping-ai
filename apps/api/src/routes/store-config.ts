import type { FastifyInstance } from 'fastify';
import { toPublicStoreConfig } from '@dropshipping/stores';
import { sendStoreConfigError } from '../http-helpers.js';
import { loadStoreConfig } from '../store-files.js';

export type StoreConfigRouteDependencies = {
  // Resolved by app.ts after .env is loaded.
  defaultStoreSlug: string;
};

export function registerStoreConfigRoutes(
  app: FastifyInstance,
  { defaultStoreSlug }: StoreConfigRouteDependencies
) {
  app.get("/stores/:slug/config", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    try {
      const store = await loadStoreConfig(slug);
      return { ok: true, store: toPublicStoreConfig(store) };
    } catch (error) {
      return sendStoreConfigError(request, reply, error, 'Nie udało się wczytać konfiguracji sklepu');
    }
  });

  app.get("/store/config", async (request, reply) => {
    try {
      const store = await loadStoreConfig(defaultStoreSlug);
      return { ok: true, store: toPublicStoreConfig(store) };
    } catch (error) {
      return sendStoreConfigError(request, reply, error, 'Nie udało się wczytać konfiguracji Giovetta Living');
    }
  });
}
