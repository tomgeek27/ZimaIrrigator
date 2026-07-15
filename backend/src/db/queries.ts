import { sql } from '../db.ts';
import type { EventType, PlantConfig, TriggerType } from '../types.ts';

export type HistoryBucket = 'raw' | '1m' | '15m' | '1h';

export async function insertHistoryPoint(plantId: string, moisture: number, pumpActive: boolean, timestamp: Date) {
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
      auto_enabled = ${config.autoEnabled}
    WHERE id = ${config.id}
  `;
}

export async function fetchHistory(plantId: string, sinceTimestamp: Date, bucket: HistoryBucket) {
  if (bucket === 'raw') {
    return sql`
      SELECT
        moisture::float8 as moisture,
        pump_state as "pumpState",
        (EXTRACT(EPOCH FROM timestamp) * 1000)::bigint as timestamp
      FROM plant_history
      WHERE plant_id = ${plantId} AND timestamp >= ${sinceTimestamp}
      ORDER BY timestamp ASC
    `;
  }

  const bucketExpr =
    bucket === '1m'
      ? sql`date_trunc('minute', timestamp)`
      : bucket === '15m'
        ? sql`date_trunc('hour', timestamp) + floor(extract(minute from timestamp) / 15) * interval '15 minute'`
        : sql`date_trunc('hour', timestamp)`;

  return sql`
    WITH points AS (
      SELECT
        ${bucketExpr} as bucket_ts,
        moisture,
        pump_state
      FROM plant_history
      WHERE plant_id = ${plantId} AND timestamp >= ${sinceTimestamp}
    )
    SELECT
      ROUND(AVG(moisture)::numeric, 2)::float8 as moisture,
      MAX(pump_state)::int as "pumpState",
      (EXTRACT(EPOCH FROM bucket_ts) * 1000)::bigint as timestamp
    FROM points
    GROUP BY bucket_ts
    ORDER BY bucket_ts ASC
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

export async function deleteHistoryOlderThan(cutoff: Date): Promise<number> {
  const rows = await sql<{ deleted: number }[]>`
    WITH deleted AS (
      DELETE FROM plant_history
      WHERE timestamp < ${cutoff}
      RETURNING 1
    )
    SELECT COUNT(*)::int AS deleted FROM deleted
  `;

  return rows[0]?.deleted ?? 0;
}
