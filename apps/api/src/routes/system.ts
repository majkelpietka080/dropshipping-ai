import type { FastifyInstance } from 'fastify';

export function registerSystemRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ ok: true, service: 'dropshipping-ai-api' }));

  app.get("/", async (_request, reply) => {
    return reply.type("text/html").send("<h1>Giovetta Living AI</h1><p>API działa poprawnie.</p>");
  });
}
