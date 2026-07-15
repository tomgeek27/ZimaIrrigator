const DEFAULT_HISTORY_SAMPLE_INTERVAL_MS = 60_000;

const configuredInterval = Number(
  process.env.HISTORY_SAMPLE_INTERVAL_MS ?? DEFAULT_HISTORY_SAMPLE_INTERVAL_MS
);

export const HISTORY_SAMPLE_INTERVAL_MS =
  Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_HISTORY_SAMPLE_INTERVAL_MS;

interface LastPersistedSample {
  timestampMs: number;
  pumpActive: boolean;
}

const lastPersistedByPlant = new Map<string, LastPersistedSample>();

export function shouldPersistHistorySample(
  plantId: string,
  nowMs: number,
  pumpActive: boolean
): boolean {
  const previous = lastPersistedByPlant.get(plantId);

  // Primo campione per la pianta: sempre persistito.
  if (!previous) return true;

  // Transizione stato pompa: sempre persistita per non perdere ON/OFF.
  if (previous.pumpActive !== pumpActive) return true;

  // In assenza di transizioni, applica il throttling temporale.
  return nowMs - previous.timestampMs >= HISTORY_SAMPLE_INTERVAL_MS;
}

export function markHistorySamplePersisted(
  plantId: string,
  timestampMs: number,
  pumpActive: boolean
): void {
  lastPersistedByPlant.set(plantId, { timestampMs, pumpActive });
}
