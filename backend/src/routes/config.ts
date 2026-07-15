import type { FastifyInstance } from 'fastify';
import { plantsCache } from '../state.ts';
import { evaluatePump } from '../pumpControl.ts';
import { applyPumpDecision } from '../pumpActions.ts';
import { insertEvent, updatePlantConfig } from '../db/queries.ts';
import { broadcastUpdate } from '../broadcast.ts';
import type { PlantConfig } from '../types.ts';

const configBodySchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    moistureMin: { type: 'number' },
    moistureMax: { type: 'number' },
    autoEnabled: { type: 'boolean' },
    relayPin: { type: 'number' },
  },
};

export async function configRoutes(fastify: FastifyInstance) {
  fastify.post('/api/config', { schema: { body: configBodySchema } }, async (request, reply) => {
    const body = request.body as Partial<PlantConfig> & { id: string };

    const plant = plantsCache[body.id];
    if (!plant) {
      return reply.code(404).send({ error: 'Pianta non trovata' });
    }

    const nextConfig: PlantConfig = {
      ...plant.config,
      ...body,
      relayPin: Number(body.relayPin ?? plant.config.relayPin),
    };
    const previousConfig: PlantConfig = { ...plant.config };
    const wasAutoEnabled = plant.config.autoEnabled;

    if (!Number.isFinite(nextConfig.relayPin)) {
      return reply.code(400).send({ error: 'relayPin non valido' });
    }

    await updatePlantConfig(nextConfig);
    plant.config = nextConfig;

    const trackedFields: Array<keyof Omit<PlantConfig, 'id'>> = [
      'name',
      'moistureMin',
      'moistureMax',
      'autoEnabled',
      'relayPin',
    ];

    for (const field of trackedFields) {
      const oldValue = previousConfig[field];
      const newValue = nextConfig[field];
      if (oldValue === newValue) continue;

      await insertEvent('CONFIG', 'CONFIG_UPDATED', {
        plantId: nextConfig.id,
        triggerType: 'MANUAL',
        level: 'info',
        details: {
          field,
          oldValue,
          newValue,
        },
      });
    }

    // Spegni subito la pompa solo nel momento in cui l'automazione viene disattivata.
    if (wasAutoEnabled && !nextConfig.autoEnabled && plant.pumpActive) {
      await applyPumpDecision(
        plant,
        {
          pumpActive: false,
          changed: true,
          reason: 'Automazione disabilitata: spegnimento pompa immediato',
        },
        Date.now()
      );

      broadcastUpdate();
      return { success: true };
    }

    // Riapplica subito l'isteresi con la nuova config, senza aspettare la prossima telemetria
    const decision = evaluatePump(plant.config, plant.currentMoisture, plant.pumpActive);
    await applyPumpDecision(plant, decision, Date.now());

    broadcastUpdate();
    return { success: true };
  });
}
