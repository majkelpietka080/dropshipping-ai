import type { FastifyInstance } from 'fastify';
import { createStoreConfig, type StoreProposal } from '@dropshipping/stores';
import type { InFlightGuard } from '../product-approval.js';
import { saveJsonArray } from '../storage.js';
import { findAvailableStoreSlug, writeStoreConfigFiles } from '../store-files.js';

export type StoreProposalRouteDependencies = {
  // Owned by app.ts and created once per process.
  storeProposals: Map<string, StoreProposal>;
  storeProposalOperations: InFlightGuard;
};

export function registerStoreProposalRoutes(
  app: FastifyInstance,
  { storeProposals, storeProposalOperations }: StoreProposalRouteDependencies
) {
  app.post("/agent/stores/propose", async (request, reply) => {
    const body = request.body as {
      name: string;
      tagline: string;
      niche: string;
      productCategories: string[];
      brand: { primaryColor?: string; secondaryColor?: string; style?: string };
      aiInfluencer: { enabled: boolean; name?: string; ageRange?: string; personality?: string[] };
      reason: string;
    } | undefined;

    if (
      typeof body?.name !== 'string' || !body.name.trim() ||
      typeof body.tagline !== 'string' ||
      typeof body.niche !== 'string' ||
      !Array.isArray(body.productCategories)
    ) {
      return reply.code(400).send({
        ok: false,
        error: 'name, tagline, niche i productCategories są wymagane'
      });
    }

    // Explicit fields only: the body must not override id, status or createdAt.
    const proposal: StoreProposal = {
      id: crypto.randomUUID(),
      name: body.name,
      tagline: body.tagline,
      niche: body.niche,
      productCategories: body.productCategories,
      brand: body.brand ?? {},
      aiInfluencer: body.aiInfluencer ?? { enabled: false },
      reason: body.reason,
      status: "pending" as const,
      createdAt: new Date().toISOString()
    };

    storeProposals.set(proposal.id, proposal);
    await saveJsonArray('store-proposals.json', Array.from(storeProposals.values()));

    return reply.code(201).send({ ok: true, proposal });
  });

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
