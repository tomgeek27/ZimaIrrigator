import type { PlantState, PumpDecision } from './types.ts';
import { sendSerialCommand } from './serial.ts';
import { insertIrrigationLog } from './db/queries.ts';

/**
 * Applica una decisione presa da evaluatePump(): invia il comando seriale
 * al relè e persiste l'evento nei log, solo se lo stato è effettivamente
 * cambiato. Usato sia dal flusso telemetria che dalla route /api/config.
 */
export async function applyPumpDecision(plant: PlantState, decision: PumpDecision, timestamp: number): Promise<void> {
  if (!decision.changed) return;

  plant.pumpActive = decision.pumpActive;

  sendSerialCommand(plant.config.relayPin, decision.pumpActive ? 'ON' : 'OFF');

  await insertIrrigationLog(
    plant.config.id,
    decision.pumpActive ? 'PUMP_ON' : 'PUMP_OFF',
    'AUTOMATIC',
    decision.reason,
    timestamp
  );
}
