import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import fastifyCors from '@fastify/cors';

import { loadPlantsFromDb } from './state.ts';
import { connectSerial } from './serial.ts';
import { handleNewTelemetry } from './telemetry.ts';
import { startHistoryRetentionJob } from './historyRetention.ts';
import { startEventLogRetentionJob } from './eventLogRetention.ts';

import { plantsRoutes } from './routes/plants.ts';
import { historyRoutes } from './routes/history.ts';
import { logsRoutes } from './routes/logs.ts';
import { configRoutes } from './routes/config.ts';
import { pumpRoutes } from './routes/pump.ts';
import { healthRoutes } from './routes/health.ts';

const PORT = 3001;

async function main() {
  const fastify = Fastify({ logger: false });

  await fastify.register(fastifyCors, { origin: '*' });
  await fastify.register(websocketPlugin);

  await fastify.register(plantsRoutes);
  await fastify.register(historyRoutes);
  await fastify.register(logsRoutes);
  await fastify.register(configRoutes);
  await fastify.register(pumpRoutes);
  await fastify.register(healthRoutes);

  await loadPlantsFromDb();
  startHistoryRetentionJob();
  startEventLogRetentionJob();

  const connected = connectSerial(handleNewTelemetry);
  if (!connected) {
    console.error('⚠️ Arduino non collegato');
    // TODO: se non collegato mostrare errore a schermo
    //startTelemetrySimulator();
  }

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 Fastify + Postgres Backend attivo sulla porta ${PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
