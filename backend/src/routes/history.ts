import type { FastifyInstance } from 'fastify';
import { fetchHistory, type HistoryBucket } from '../db/queries.ts';

type HistoryTimeframe = '5m' | '15m' | '30m' | '1h' | '12h' | '24h' | '3d' | '7d';

interface HistoryWindowConfig {
  windowMs: number;
  bucket: HistoryBucket;
}

const TIMEFRAME_CONFIG: Record<HistoryTimeframe, HistoryWindowConfig> = {
  '5m': { windowMs: 5 * 60 * 1000, bucket: 'raw' },
  '15m': { windowMs: 15 * 60 * 1000, bucket: 'raw' },
  '30m': { windowMs: 30 * 60 * 1000, bucket: 'raw' },
  '1h': { windowMs: 1 * 60 * 60 * 1000, bucket: '1m' },
  '12h': { windowMs: 12 * 60 * 60 * 1000, bucket: '15m' },
  '24h': { windowMs: 24 * 60 * 60 * 1000, bucket: '15m' },
  '3d': { windowMs: 3 * 24 * 60 * 60 * 1000, bucket: '1h' },
  '7d': { windowMs: 7 * 24 * 60 * 60 * 1000, bucket: '1h' },
};

const DEFAULT_TIMEFRAME: HistoryTimeframe = '24h';

function normalizeTimeframe(value?: string): HistoryTimeframe {
  if (!value) return DEFAULT_TIMEFRAME;
  return (value in TIMEFRAME_CONFIG ? value : DEFAULT_TIMEFRAME) as HistoryTimeframe;
}

export async function historyRoutes(fastify: FastifyInstance) {
  fastify.get('/api/history/:plantId', async (request) => {
    const { plantId } = request.params as { plantId: string };
    const { timeframe } = request.query as { timeframe?: string };

    const effectiveTimeframe = normalizeTimeframe(timeframe);
    const config = TIMEFRAME_CONFIG[effectiveTimeframe];
    const sinceTimestamp = new Date(Date.now() - config.windowMs);

    return fetchHistory(plantId, sinceTimestamp, config.bucket);
  });
}
