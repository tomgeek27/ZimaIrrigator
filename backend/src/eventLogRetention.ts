import { deleteEventLogOlderThan } from './db/queries.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 180;
const RETENTION_RUN_INTERVAL_MS = DAY_MS;

const configuredRetentionDays = Number(
  process.env.EVENT_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS
);

const EVENT_LOG_RETENTION_DAYS =
  Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0
    ? configuredRetentionDays
    : DEFAULT_RETENTION_DAYS;

function getRetentionCutoff(nowMs = Date.now()): Date {
  return new Date(nowMs - EVENT_LOG_RETENTION_DAYS * DAY_MS);
}

export async function runEventLogRetention(nowMs = Date.now()): Promise<number> {
  const cutoff = getRetentionCutoff(nowMs);
  const deletedRows = await deleteEventLogOlderThan(cutoff);

  console.log(
    `[RETENTION] event_log: deleted=${deletedRows}, cutoff=${cutoff.toISOString()}, retentionDays=${EVENT_LOG_RETENTION_DAYS}`
  );

  return deletedRows;
}

export function startEventLogRetentionJob(): void {
  // Esegui una prima pulizia subito all'avvio del backend.
  void runEventLogRetention().catch((err) => {
    console.error('[RETENTION] event_log first run failed', err);
  });

  setInterval(() => {
    void runEventLogRetention().catch((err) => {
      console.error('[RETENTION] event_log scheduled run failed', err);
    });
  }, RETENTION_RUN_INTERVAL_MS);
}
