export interface PlantConfig {
  id: string;
  name: string;
  moistureMin: number;
  moistureMax: number;
  autoEnabled: boolean;
  startEnabled: boolean;
  stopEnabled: boolean;
  relayPin: number;
}

export interface PlantState {
  config: PlantConfig;
  currentMoisture: number;
  pumpActive: boolean;
}

export type LogLevel = 'info' | 'warning' | 'error';
export type TriggerType = 'MANUAL' | 'AUTOMATIC';
export type EventType = 'PUMP_ON' | 'PUMP_OFF';

export interface PumpDecision {
  pumpActive: boolean;
  changed: boolean;
  reason: string;
}
