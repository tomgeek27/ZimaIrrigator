const DEFAULT_MIN_COOLDOWN_MS = 2000;

const cooldownEnv = Number(process.env.MIN_PUMP_COOLDOWN_MS ?? DEFAULT_MIN_COOLDOWN_MS);
const MIN_PUMP_COOLDOWN_MS = Number.isFinite(cooldownEnv) && cooldownEnv >= 0
  ? cooldownEnv
  : DEFAULT_MIN_COOLDOWN_MS;

const safetyTimers = new Map<string, NodeJS.Timeout>();
const lastPumpStartAt = new Map<string, number>();
const lastCooldownWarnAt = new Map<string, number>();

export function clearSafetyTimer(plantId: string): void {
  const timer = safetyTimers.get(plantId);
  if (!timer) return;
  clearTimeout(timer);
  safetyTimers.delete(plantId);
}

export function scheduleSafetyTimer(
  plantId: string,
  maxPumpRuntimeMs: number,
  onTimeout: () => void | Promise<void>
): void {
  clearSafetyTimer(plantId);

  const safeRuntime = Number.isFinite(maxPumpRuntimeMs) && maxPumpRuntimeMs > 0
    ? maxPumpRuntimeMs
    : 5_000;

  const timer = setTimeout(() => {
    safetyTimers.delete(plantId);
    void onTimeout();
  }, safeRuntime);

  safetyTimers.set(plantId, timer);
}

export function markPumpStarted(plantId: string, timestamp: number): void {
  lastPumpStartAt.set(plantId, timestamp);
  lastCooldownWarnAt.delete(plantId);
}

export function markCooldownLock(plantId: string, timestamp: number): void {
  // Ancora il cooldown a "ora" per evitare riaccensioni immediate post-safety stop.
  lastPumpStartAt.set(plantId, timestamp);
}

export function getCooldownRemainingMs(plantId: string, now: number): number {
  const lastStart = lastPumpStartAt.get(plantId);
  if (!lastStart) return 0;
  return Math.max(0, MIN_PUMP_COOLDOWN_MS - (now - lastStart));
}

export function getCooldownUntilMs(plantId: string): number | null {
  const lastStart = lastPumpStartAt.get(plantId);
  if (!lastStart) return null;
  return lastStart + MIN_PUMP_COOLDOWN_MS;
}

export function getMinPumpCooldownMs(): number {
  return MIN_PUMP_COOLDOWN_MS;
}

export function shouldEmitCooldownWarning(plantId: string, now: number, minIntervalMs = 5000): boolean {
  const lastWarn = lastCooldownWarnAt.get(plantId) ?? 0;
  if (now - lastWarn < minIntervalMs) return false;

  lastCooldownWarnAt.set(plantId, now);
  return true;
}
