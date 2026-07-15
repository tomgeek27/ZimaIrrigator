import type { PlantState, PumpDecision, TriggerType } from './types.ts';
import { sendSerialCommand } from './serial.ts';
import { insertIrrigationLog } from './db/queries.ts';

export async function setPumpState(
  plant: PlantState,
  nextPumpActive: boolean,
  triggerType: TriggerType,
  reason: string,
  timestamp: number
): Promise<boolean> {
  if (plant.pumpActive === nextPumpActive) {
    return false;
  }

  plant.pumpActive = nextPumpActive;

  sendSerialCommand(plant.config.relayPin, nextPumpActive ? 'ON' : 'OFF');
  // await insertIrrigationLog(
  //   plant.config.id,
  //   nextPumpActive ? 'PUMP_ON' : 'PUMP_OFF',
  //   triggerType,
  //   reason,
  //   timestamp
  // );

  return true;
}

/**
 * Applica una decisione presa da evaluatePump(): invia il comando seriale
 * al relè e persiste l'evento nei log, solo se lo stato è effettivamente
 * cambiato. Usato sia dal flusso telemetria che dalla route /api/config.
 */
export async function applyPumpDecision(plant: PlantState, decision: PumpDecision, timestamp: number): Promise<void> {
  if (!decision.changed) return;

  await setPumpState(plant, decision.pumpActive, 'AUTOMATIC', decision.reason, timestamp);
}
