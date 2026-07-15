export interface PlantConfig {
  id: string;
  name: string;
  moistureMin: number;
  moistureMax: number;
  autoEnabled: boolean;
  relayPin: number;
}

export interface PlantState {
  config: PlantConfig;
  currentMoisture: number;
  pumpActive: boolean;
}

export type LogLevel = 'info' | 'warning' | 'error';
export type TriggerType = 'MANUAL' | 'AUTOMATIC' | 'SAFETY' | 'SYSTEM';
export type EventCategory = 'PUMP' | 'CONFIG' | 'SYSTEM';
export type EventType =
  | 'PUMP_ON'
  | 'PUMP_OFF'
  | 'CONFIG_UPDATED'
  | 'SERIAL_FLUSH_FAILED'
  | 'SERIAL_RELAY_FORCED_OFF'
  | 'SERIAL_PARSE_ERROR'
  | 'SERIAL_UNHANDLED_MESSAGE';

export interface PumpDecision {
  pumpActive: boolean;
  changed: boolean;
  reason: string;
}
