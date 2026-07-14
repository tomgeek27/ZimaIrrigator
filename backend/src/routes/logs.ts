import type { FastifyInstance } from 'fastify';
import { fetchLogs } from '../db/queries.ts';

export async function logsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/logs/:plantId', async (request) => {
    const { plantId } = request.params as { plantId: string };
    return fetchLogs(plantId, 100);
  });
}
