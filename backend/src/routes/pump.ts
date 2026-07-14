import type { FastifyInstance } from 'fastify';
import { plantsCache } from '../state.ts';
import { setPumpState } from '../pumpActions.ts';
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

    console.log(`[API /pump] comando manuale: plant=${plant.config.id}, relayPin=${relayPin}, active=${active}`);

    const wasActive = plant.pumpActive;

    const changed = await setPumpState(
      plant,
      active === 'ON',
      'MANUAL',
      `Override manuale relè -> ${active}`,
      Date.now()
    );

    if (active === 'ON' && !wasActive && !changed) {
      return reply.code(429).send({
        error: 'Accensione bloccata da sicurezza (cooldown attivo o vincolo safety)',
      });
    }

    broadcastUpdate();
    return { success: true };
  });
}
