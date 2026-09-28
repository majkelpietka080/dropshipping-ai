import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true, service: 'dropshipping-ai-api' }));
app.get('/', async () => ({ name: 'dropshipping-ai', status: 'online', phase: 1 }));

const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? '0.0.0.0';
await app.listen({ port, host });
