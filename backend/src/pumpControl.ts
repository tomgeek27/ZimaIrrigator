import type { PlantConfig, PumpDecision } from './types.ts';

/**
 * Unica fonte di verità per la logica di isteresi.
 *
 * Nel codice originale questa logica era duplicata: una versione (più semplice,
 * solo 2 rami) dentro handleNewTelemetry, e una versione diversa (4 rami) dentro
 * la route POST /api/config. La versione della route /config faceva scattare la
 * pompa anche su condizioni "inverse" (es. accensione quando moisture <= max con
 * stopEnabled, spegnimento quando moisture >= min con startEnabled), cosa che
 * rompe la semantica di isteresi classica (accendi sotto la soglia minima,
 * spegni sopra la soglia massima) e può causare comportamenti diversi a seconda
 * che il cambio di stato arrivi da una nuova telemetria o da un salvataggio di
 * configurazione. Questa funzione sostituisce entrambe le versioni.
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

  if (config.startEnabled && !pumpActive && currentMoisture < config.moistureMin) {
    return {
      pumpActive: true,
      changed: true,
      reason: 'Automazione (soglia minima superata)',
    };
  }

  if (config.stopEnabled && pumpActive && currentMoisture > config.moistureMax) {
    return {
      pumpActive: false,
      changed: true,
      reason: 'Automazione (soglia massima raggiunta)',
    };
  }

  return { pumpActive, changed: false, reason: '' };
}
