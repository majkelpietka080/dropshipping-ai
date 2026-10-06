import type { FastifyInstance } from 'fastify';
import { createStoreConfig, type StoreProposal } from '@dropshipping/stores';
import type { InFlightGuard } from '../product-approval.js';
import { saveJsonArray } from '../storage.js';
import { findAvailableStoreSlug, writeStoreConfigFiles } from '../store-files.js';

export type StoreProposalRouteDependencies = {
  // Owned by app.ts; the same instances are shared with POST /agent/stores/propose.
  storeProposals: Map<string, StoreProposal>;
  storeProposalOperations: InFlightGuard;
};

export function registerStoreProposalRoutes(
  app: FastifyInstance,
  { storeProposals, storeProposalOperations }: StoreProposalRouteDependencies
) {
  app.get("/agent/stores/proposals", async () => {
    return {
      ok: true,
      proposals: Array.from(storeProposals.values())
    };
  });

  app.post("/agent/stores/proposals/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const proposal = storeProposals.get(id);

    if (!proposal) {
      return reply.code(404).send({ ok: false, error: "Propozycja sklepu nie istnieje" });
    }

    if (proposal.status !== "pending") {
      return reply.code(409).send({ ok: false, error: `Propozycja ma już status: ${proposal.status}` });
    }

    if (!storeProposalOperations.tryAcquire(id)) {
      return reply.code(409).send({ ok: false, error: "Ta propozycja jest właśnie przetwarzana" });
    }

    let storeSlug: string;

    try {
      storeSlug = await findAvailableStoreSlug(proposal.name);
      const config = createStoreConfig({
        id: proposal.id,
        name: proposal.name,
        tagline: proposal.tagline,
        niche: proposal.niche,
        productCategories: proposal.productCategories,
        brand: proposal.brand,
        aiInfluencer: proposal.aiInfluencer
      });

      await writeStoreConfigFiles(storeSlug, config);
      proposal.status = "approved";
      await saveJsonArray('store-proposals.json', Array.from(storeProposals.values()));
    } finally {
      storeProposalOperations.release(id);
    }

    return {
      ok: true,
      message: "Propozycja sklepu zatwierdzona i konfiguracja utworzona.",
      proposal,
      storeSlug
    };
  });

  app.post("/agent/stores/proposals/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const proposal = storeProposals.get(id);

    if (!proposal) {
      return reply.code(404).send({ ok: false, error: "Propozycja sklepu nie istnieje" });
    }

    if (proposal.status !== "pending") {
      return reply.code(409).send({ ok: false, error: `Propozycja ma już status: ${proposal.status}` });
    }

    if (storeProposalOperations.has(id)) {
      return reply.code(409).send({ ok: false, error: "Ta propozycja jest właśnie przetwarzana" });
    }

    proposal.status = "rejected";
    await saveJsonArray('store-proposals.json', Array.from(storeProposals.values()));

    return {
      ok: true,
      message: "Propozycja sklepu odrzucona.",
      proposal
    };
  });
}
