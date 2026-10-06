import type { FastifyInstance } from 'fastify';
import { askClaude } from '@dropshipping/ai';
import { sendUpstreamError } from '../http-helpers.js';

export function registerAiRoutes(app: FastifyInstance) {
  app.post('/ai/test', async (request, reply) => {
    const body = request.body as { prompt?: string } | undefined;
    if (!body?.prompt) return reply.code(400).send({ error: 'prompt is required' });

    try {
      return { response: await askClaude(body.prompt) };
    } catch (error) {
      return sendUpstreamError(request, reply, 'Zapytanie do Claude nie powiodło się.', error);
    }
  });
}
