import { sql } from './db.ts';
import type { PlantState } from './types.ts';
import { getCooldownRemainingMs, getCooldownUntilMs } from './pumpSafety.ts';

// Stato cache volatile in RAM per la gestione real-time dei WebSocket
export const plantsCache: Record<string, PlantState> = {};

export function getPlantsSnapshot(now = Date.now()): Record<string, PlantState & { cooldownRemainingMs: number; cooldownUntilMs: number | null }> {
  const snapshot: Record<string, PlantState & { cooldownRemainingMs: number; cooldownUntilMs: number | null }> = {};

  for (const [id, plant] of Object.entries(plantsCache)) {
    snapshot[id] = {
      ...plant,
      cooldownRemainingMs: getCooldownRemainingMs(id, now),
      cooldownUntilMs: getCooldownUntilMs(id),
    };
  }

  return snapshot;
}

export async function loadPlantsFromDb(): Promise<void> {
  const rows = await sql`
    SELECT id, name, moisture_min, moisture_max, auto_enabled, start_enabled, stop_enabled, relay_pin, max_pump_runtime_ms
    FROM plant_config
  `;

  for (const row of rows) {
    plantsCache[row.id] = {
      config: {
        id: row.id,
        name: row.name,
        moistureMin: row.moisture_min,
        moistureMax: row.moisture_max,
        autoEnabled: row.auto_enabled,
        startEnabled: row.start_enabled,
        stopEnabled: row.stop_enabled,
        relayPin: row.relay_pin,
        maxPumpRuntimeMs: row.max_pump_runtime_ms,
      },
      currentMoisture: 50, // Verrà sovrascritto dalla prima lettura utile di Arduino
      pumpActive: false,
    };
  }
}
