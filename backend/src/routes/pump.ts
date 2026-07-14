import type { FastifyInstance } from 'fastify';
import { plantsCache } from '../state.ts';
import { sendSerialCommand } from '../serial.ts';
import { insertIrrigationLog } from '../db/queries.ts';
import { broadcastUpdate } from '../broadcast.ts';

const pumpBodySchema = {
  type: 'object',
  required: ['relayPin', 'active'],
  properties: {
    relayPin: { type: 'number' },
    active: { type: 'string', enum: ['ON', 'OFF'] },
  },
};

export async function pumpRoutes(fastify: FastifyInstance) {
  fastify.post('/api/pump', { schema: { body: pumpBodySchema } }, async (request, reply) => {
    const { relayPin, active } = request.body as { relayPin: number; active: 'ON' | 'OFF' };

    const plant = Object.values(plantsCache).find((item) => item.config.relayPin === relayPin);
    if (!plant) {
      return reply.code(404).send({ error: `Pianta non trovata per relayPin=${relayPin}` });
    }

    plant.pumpActive = active === 'ON';
    console.log(`[API /pump] comando manuale: plant=${plant.config.id}, relayPin=${relayPin}, active=${active}`);

    sendSerialCommand(relayPin, active);

    await insertIrrigationLog(
      plant.config.id,
      plant.pumpActive ? 'PUMP_ON' : 'PUMP_OFF',
      'MANUAL',
      `Override manuale relè -> ${active}`,
      Date.now()
    );

    broadcastUpdate();
    return { success: true };
  });
}
