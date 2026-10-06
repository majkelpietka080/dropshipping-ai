import type { FastifyInstance } from 'fastify';
import { parseNumberParams, sendUpstreamError } from '../http-helpers.js';
import { searchSuppliers } from '../supplier-search.js';

export function registerSupplierRoutes(app: FastifyInstance) {
  app.get('/suppliers/search', async (request, reply) => {
    const query = request.query as {
      query?: string;
      category?: string;
      maxPrice?: string;
      currency?: string;
      shippingCountry?: string;
      limit?: string;
    };

    const parsed = parseNumberParams(query, ['maxPrice', 'limit']);

    if (!parsed.ok) {
      return reply.code(400).send({ ok: false, error: parsed.error });
    }

    try {
      const { manager, products, supplierErrors } = await searchSuppliers({
        query: query.query,
        category: query.category,
        maxPrice: parsed.numbers.maxPrice,
        currency: query.currency,
        shippingCountry: query.shippingCountry,
        limit: parsed.numbers.limit
      });

      return {
        ok: true,
        suppliers: manager.listSuppliers(),
        count: products.length,
        products,
        supplierErrors
      };
    } catch (error) {
      return sendUpstreamError(request, reply, 'Wyszukiwanie u dostawców nie powiodło się.', error);
    }
  });
}
