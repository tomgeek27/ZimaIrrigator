import type { FastifyInstance } from 'fastify';
import { fetchLogs } from '../db/queries.ts';
import { formatEventMessage } from '../eventMessages.ts';

export async function logsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/logs/:plantId', async (request) => {
    const { plantId } = request.params as { plantId: string };
    const rows = await fetchLogs(plantId, 100);

    return rows.map((row) => ({
      id: row.id,
      plantId: row.plantId,
      plantName: row.plantName,
      category: row.category,
      eventType: row.eventType,
      triggerType: row.triggerType,
      level: row.level,
      details: row.details,
      timestamp: row.timestamp,
      message: `[${row.plantName ?? 'Pianta'} - ${row.plantId ?? 'n/d'}] ${formatEventMessage(row)}`,
    }));
  });
}
