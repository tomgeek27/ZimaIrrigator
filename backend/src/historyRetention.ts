import { deleteHistoryOlderThan } from './db/queries.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const RETENTION_RUN_INTERVAL_MS = DAY_MS;

const configuredRetentionDays = Number(
  process.env.HISTORY_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS
);

const HISTORY_RETENTION_DAYS =
  Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0
    ? configuredRetentionDays
    : DEFAULT_RETENTION_DAYS;

function getRetentionCutoff(nowMs = Date.now()): Date {
  return new Date(nowMs - HISTORY_RETENTION_DAYS * DAY_MS);
}

export async function runHistoryRetention(nowMs = Date.now()): Promise<number> {
  const cutoff = getRetentionCutoff(nowMs);
  const deletedRows = await deleteHistoryOlderThan(cutoff);

  console.log(
    `[RETENTION] plant_history: deleted=${deletedRows}, cutoff=${cutoff.toISOString()}, retentionDays=${HISTORY_RETENTION_DAYS}`
  );

  return deletedRows;
}

export function startHistoryRetentionJob(): void {
  // Esegui una prima pulizia subito all'avvio del backend.
  void runHistoryRetention().catch((err) => {
    console.error('[RETENTION] first run failed', err);
  });

  setInterval(() => {
    void runHistoryRetention().catch((err) => {
      console.error('[RETENTION] scheduled run failed', err);
    });
  }, RETENTION_RUN_INTERVAL_MS);
}
