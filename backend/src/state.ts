import { sql } from './db.ts';
import type { PlantState } from './types.ts';

// Stato cache volatile in RAM per la gestione real-time dei WebSocket
export const plantsCache: Record<string, PlantState> = {};

export function getPlantsSnapshot(): Record<string, PlantState> {
  const snapshot: Record<string, PlantState> = {};

  for (const [id, plant] of Object.entries(plantsCache)) {
    snapshot[id] = {
      ...plant,
    };
  }

  return snapshot;
}

export async function loadPlantsFromDb(): Promise<void> {
  const rows = await sql`
    SELECT id, name, moisture_min, moisture_max, auto_enabled, relay_pin
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
        relayPin: row.relay_pin,
      },
      currentMoisture: 50, // Verrà sovrascritto dalla prima lettura utile di Arduino
      pumpActive: false,
    };
  }
}
