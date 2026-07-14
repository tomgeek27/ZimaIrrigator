import { sql } from '../db.ts';
import type { EventType, PlantConfig, TriggerType } from '../types.ts';

export async function insertHistoryPoint(plantId: string, moisture: number, pumpActive: boolean, timestamp: number) {
  await sql`
    INSERT INTO plant_history (plant_id, moisture, pump_state, timestamp)
    VALUES (${plantId}, ${moisture}, ${pumpActive ? 1 : 0}, ${timestamp})
  `;
}

export async function insertIrrigationLog(
  plantId: string,
  eventType: EventType,
  triggerType: TriggerType,
  message: string,
  timestamp: number
) {
  await sql`
    INSERT INTO irrigation_logs (plant_id, event_type, trigger_type, message, timestamp)
    VALUES (${plantId}, ${eventType}, ${triggerType}, ${message}, ${timestamp})
  `;
}

export async function updatePlantConfig(config: PlantConfig) {
  await sql`
    UPDATE plant_config SET
      moisture_min = ${config.moistureMin},
      moisture_max = ${config.moistureMax},
      auto_enabled = ${config.autoEnabled},
      start_enabled = ${config.startEnabled},
      stop_enabled = ${config.stopEnabled},
      max_pump_runtime_ms = ${config.maxPumpRuntimeMs}
    WHERE id = ${config.id}
  `;
}

export async function fetchHistory(plantId: string, sinceTimestamp: number) {
  return sql`
    SELECT moisture, pump_state as "pumpState", timestamp
    FROM plant_history
    WHERE plant_id = ${plantId} AND timestamp >= ${sinceTimestamp}
    ORDER BY timestamp ASC
  `;
}

export async function fetchLogs(plantId: string, limit = 100) {
  return sql`
    SELECT event_type as "eventType", trigger_type as "triggerType", message, timestamp
    FROM irrigation_logs
    WHERE plant_id = ${plantId}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
}
