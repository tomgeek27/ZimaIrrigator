import type { PlantConfig, PumpDecision } from './types.ts';

/**
 * Unica fonte di verità per la logica di isteresi.
 *
 * Nel codice originale questa logica era duplicata: una versione (più semplice,
 * solo 2 rami) dentro handleNewTelemetry, e una versione diversa (4 rami) dentro
 * la route POST /api/config, generando divergenze di comportamento tra eventi
 * di telemetria e salvataggio configurazione. Questa funzione è la regola unica.
 */
export function evaluatePump(
  config: PlantConfig,
  currentMoisture: number,
  pumpActive: boolean
): PumpDecision {
  // Con automazione disabilitata non forziamo cambi di stato qui:
  // il manuale deve poter mantenere la pompa nello stato scelto.
  // Lo spegnimento al toggle OFF dell'automazione viene gestito nella route /api/config.
  if (!config.autoEnabled) {
    return { pumpActive, changed: false, reason: '' };
  }

  if (!pumpActive && currentMoisture < config.moistureMin) {
    return {
      pumpActive: true,
      changed: true,
      reason: 'Automazione (soglia minima superata)',
    };
  }

  if (pumpActive && currentMoisture > config.moistureMax) {
    return {
      pumpActive: false,
      changed: true,
      reason: 'Automazione (soglia massima raggiunta)',
    };
  }

  return { pumpActive, changed: false, reason: '' };
}
