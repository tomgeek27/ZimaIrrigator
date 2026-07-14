import type { PlantState, PumpDecision, TriggerType } from './types.ts';
import { sendSerialCommand } from './serial.ts';
import { insertIrrigationLog } from './db/queries.ts';
import { broadcastLog, broadcastUpdate } from './broadcast.ts';
import {
  clearSafetyTimer,
  getCooldownRemainingMs,
  getMinPumpCooldownMs,
  markCooldownLock,
  markPumpStarted,
  scheduleSafetyTimer,
  shouldEmitCooldownWarning,
} from './pumpSafety.ts';

async function safetyStopPlant(plant: PlantState, timestamp: number): Promise<void> {
  if (!plant.pumpActive) return;

  plant.pumpActive = false;
  clearSafetyTimer(plant.config.id);
  markCooldownLock(plant.config.id, timestamp);
  sendSerialCommand(plant.config.relayPin, 'OFF');

  const reason = `Sicurezza: timeout pompa superato (${plant.config.maxPumpRuntimeMs}ms)`;
  await insertIrrigationLog(plant.config.id, 'PUMP_OFF', 'SAFETY', reason, timestamp);

  broadcastLog(
    `[SAFETY][${plant.config.id}] ${reason} -> relè ${plant.config.relayPin} OFF`,
    'warning'
  );
  broadcastUpdate();
}

export async function setPumpState(
  plant: PlantState,
  nextPumpActive: boolean,
  triggerType: TriggerType,
  reason: string,
  timestamp: number
): Promise<boolean> {
  if (plant.pumpActive === nextPumpActive) {
    if (!nextPumpActive) {
      clearSafetyTimer(plant.config.id);
    }
    return false;
  }

  if (nextPumpActive) {
    const remainingMs = getCooldownRemainingMs(plant.config.id, timestamp);
    if (remainingMs > 0) {
      if (triggerType === 'MANUAL' && shouldEmitCooldownWarning(plant.config.id, timestamp)) {
        const cooldownReason = `Protezione anti-riavvio attiva: attendi ${Math.ceil(remainingMs / 1000)}s prima di riaccendere la pompa (cooldown ${Math.ceil(getMinPumpCooldownMs() / 1000)}s)`;
        broadcastLog(`[SAFETY][${plant.config.id}] ${cooldownReason}`, 'warning');
        await insertIrrigationLog(plant.config.id, 'PUMP_OFF', 'SAFETY', cooldownReason, timestamp);
      }
      return false;
    }
  }

  plant.pumpActive = nextPumpActive;

  if (nextPumpActive) {
    markPumpStarted(plant.config.id, timestamp);
    scheduleSafetyTimer(plant.config.id, plant.config.maxPumpRuntimeMs, async () => {
      await safetyStopPlant(plant, Date.now());
    });
  } else {
    clearSafetyTimer(plant.config.id);
  }

  sendSerialCommand(plant.config.relayPin, nextPumpActive ? 'ON' : 'OFF');
  await insertIrrigationLog(
    plant.config.id,
    nextPumpActive ? 'PUMP_ON' : 'PUMP_OFF',
    triggerType,
    reason,
    timestamp
  );

  return true;
}

/**
 * Applica una decisione presa da evaluatePump(): invia il comando seriale
 * al relè e persiste l'evento nei log, solo se lo stato è effettivamente
 * cambiato. Usato sia dal flusso telemetria che dalla route /api/config.
 */
export async function applyPumpDecision(plant: PlantState, decision: PumpDecision, timestamp: number): Promise<void> {
  if (!decision.changed) {
    if (!plant.pumpActive) {
      clearSafetyTimer(plant.config.id);
    }
    return;
  }

  await setPumpState(plant, decision.pumpActive, 'AUTOMATIC', decision.reason, timestamp);
}
