import type { FastifyReply, FastifyRequest } from 'fastify';
import { StoreConfigError } from '@dropshipping/stores';
import { publicErrorDetails, parseOptionalNumber } from './security.js';
import { loadStoreConfig } from './store-files.js';

// Upstream (Shopify, suppliers, AI) failures: 502 with a readable, redacted reason.
export function sendUpstreamError(
  request: FastifyRequest,
  reply: FastifyReply,
  message: string,
  error: unknown
) {
  request.log.error(error);

  return reply.code(502).send({
    ok: false,
    error: message,
    details: publicErrorDetails(error)
  });
}

// Loads the store whose pricing/delivery settings drive Product Scout.
// Unknown store -> 400, invalid config -> 500 (admin routes, details are safe).
export async function loadStoreForRequest(reply: FastifyReply, slug: string) {
  try {
    return await loadStoreConfig(slug);
  } catch (error) {
    reply.code(error instanceof StoreConfigError ? 500 : 400).send({
      ok: false,
      error: publicErrorDetails(error)
    });
    return null;
  }
}

export function parseNumberParams<K extends string>(
  values: Partial<Record<K, unknown>>,
  keys: K[]
): { ok: true; numbers: Partial<Record<K, number>> } | { ok: false; error: string } {
  const numbers: Partial<Record<K, number>> = {};

  for (const key of keys) {
    const parsed = parseOptionalNumber(values[key]);

    if (parsed === null) {
      return { ok: false, error: `Parametr ${key} musi być liczbą` };
    }

    if (parsed !== undefined) {
      numbers[key] = parsed;
    }
  }

  return { ok: true, numbers };
}

// Validation details may quote internal values (e.g. margins), so public
// endpoints only log them.
export function sendStoreConfigError(request: FastifyRequest, reply: FastifyReply, error: unknown, fallback: string) {
  if (error instanceof StoreConfigError) {
    request.log.error(error);
    return reply.code(500).send({ ok: false, error: 'Konfiguracja sklepu jest nieprawidłowa.' });
  }

  const message = error instanceof Error ? error.message : fallback;
  return reply.code(404).send({ ok: false, error: message });
}
