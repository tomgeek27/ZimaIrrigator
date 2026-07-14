import { plantsCache } from './state.ts';
import { evaluatePump } from './pumpControl.ts';
import { applyPumpDecision } from './pumpActions.ts';
import { insertHistoryPoint } from './db/queries.ts';
import { broadcastUpdate } from './broadcast.ts';

export async function handleNewTelemetry(plantId: string, moisture: number): Promise<void> {
  const plant = plantsCache[plantId];
  if (!plant) return;

  plant.currentMoisture = moisture;
  const timestamp = Date.now();

  const decision = evaluatePump(plant.config, moisture, plant.pumpActive);
  await applyPumpDecision(plant, decision, timestamp);

  // Salva sempre la lettura nello storico, a prescindere da cambi di stato pompa
  await insertHistoryPoint(plantId, moisture, plant.pumpActive, timestamp);

  broadcastUpdate();
}

/**
 * Simulatore di fallback: usato quando Arduino non è collegato, per poter
 * comunque sviluppare/testare dashboard e automazioni. Esegue un tick al minuto.
 */
export function startTelemetrySimulator(): void {
  setInterval(async () => {
    console.log('⏱️ Polling al minuto (Simulazione)...');
    for (const id in plantsCache) {
      const plant = plantsCache[id];
      const delta = plant.pumpActive ? 8 : -Math.floor(Math.random() * 3);
      const nextMoisture = Math.min(100, Math.max(0, plant.currentMoisture + delta));
      await handleNewTelemetry(id, nextMoisture);
    }
  }, 60_000);
}
