import type { FastifyInstance } from 'fastify';
import { fetchHistory } from '../db/queries.ts';

const TIMEFRAME_MS: Record<string, number> = {
  '30m': 30 * 60 * 1000,
  '1h': 1 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};
const DEFAULT_TIMEFRAME = '24h';

export async function historyRoutes(fastify: FastifyInstance) {
  fastify.get('/api/history/:plantId', async (request) => {
    const { plantId } = request.params as { plantId: string };
    const { timeframe } = request.query as { timeframe?: string };

    const windowMs = TIMEFRAME_MS[timeframe ?? DEFAULT_TIMEFRAME] ?? TIMEFRAME_MS[DEFAULT_TIMEFRAME];
    const sinceTimestamp = Date.now() - windowMs;

    return fetchHistory(plantId, sinceTimestamp);
  });
}
