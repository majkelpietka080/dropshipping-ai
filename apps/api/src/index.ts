import Fastify from 'fastify';
import cors from '@fastify/cors';
import { askClaude } from '@dropshipping/ai';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true, service: 'dropshipping-ai-api' }));

app.post('/ai/test', async (request, reply) => {
  const body = request.body as { prompt?: string } | undefined;
  if (!body?.prompt) return reply.code(400).send({ error: 'prompt is required' });
  return { response: await askClaude(body.prompt) };
});

const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? '0.0.0.0';
await app.listen({ port, host });
