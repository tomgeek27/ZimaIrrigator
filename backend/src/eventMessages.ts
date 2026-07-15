import type { EventCategory, EventType, LogLevel, TriggerType } from './types.ts';

export interface EventLogRecord {
  id: number;
  plantId: string | null;
  category: EventCategory;
  eventType: EventType;
  triggerType: TriggerType | null;
  level: LogLevel;
  details: unknown;
  timestamp: number;
}

type DetailsRecord = Record<string, unknown>;

function asRecord(value: unknown): DetailsRecord {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as DetailsRecord;
      }
    } catch {
      return {};
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as DetailsRecord;
  }
  return {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function configFieldLabel(field: string): string {
  switch (field) {
    case 'name':
      return 'nome';
    case 'moistureMin':
      return 'soglia minima umidita';
    case 'moistureMax':
      return 'soglia massima umidita';
    case 'autoEnabled':
      return 'automazione';
    case 'relayPin':
      return 'pin rele';
    default:
      return field;
  }
}

function formatConfigValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'attiva' : 'disattiva';
  if (value === null || value === undefined) return 'n/d';
  return String(value);
}

export function formatEventMessage(event: Pick<EventLogRecord, 'category' | 'eventType' | 'triggerType' | 'details'>): string {
  const details = asRecord(event.details);

  switch (event.eventType) {
    case 'PUMP_ON': {
      const relayPin = asNumber(details.relayPin);
      const moisture = asNumber(details.moisture);
      const reason = asText(details.reason);
      const pinText = relayPin === null ? '' : ` pin ${relayPin}`;
      const moistureText = moisture === null ? '' : ` (umidita ${moisture}%)`;
      const reasonText = reason ? ` Motivo: ${reason}.` : '';
      return `Pompa accesa${pinText}${moistureText}.${reasonText}`.trim();
    }
    case 'PUMP_OFF': {
      const relayPin = asNumber(details.relayPin);
      const moisture = asNumber(details.moisture);
      const reason = asText(details.reason);
      const pinText = relayPin === null ? '' : ` pin ${relayPin}`;
      const moistureText = moisture === null ? '' : ` (umidita ${moisture}%)`;
      const reasonText = reason ? ` Motivo: ${reason}.` : '';
      return `Pompa spenta${pinText}${moistureText}.${reasonText}`.trim();
    }
    case 'CONFIG_UPDATED': {
      const fieldRaw = asText(details.field) ?? asText(details.fieldName) ?? asText(details.field_name) ?? '';
      const oldValue = formatConfigValue(details.oldValue ?? details.old_value);
      const newValue = formatConfigValue(details.newValue ?? details.new_value);

      if (!fieldRaw && oldValue === 'n/d' && newValue === 'n/d') {
        return 'Configurazione aggiornata.';
      }

      const fieldLabel = fieldRaw ? configFieldLabel(fieldRaw) : 'campo';
      return `Configurazione aggiornata: ${fieldLabel} da ${oldValue} a ${newValue}.`;
    }
    case 'SERIAL_FLUSH_FAILED': {
      const error = asText(details.error);
      return error
        ? `Errore flush del buffer seriale: ${error}.`
        : 'Errore flush del buffer seriale.';
    }
    case 'SERIAL_RELAY_FORCED_OFF': {
      const relayPin = asNumber(details.relayPin);
      return relayPin === null
        ? 'Sincronizzazione seriale: rele forzato OFF alla connessione.'
        : `Sincronizzazione seriale: rele ${relayPin} forzato OFF alla connessione.`;
    }
    case 'SERIAL_PARSE_ERROR': {
      const raw = asText(details.raw);
      return raw
        ? `Riga seriale non JSON: ${raw}.`
        : 'Riga seriale non JSON ricevuta.';
    }
    case 'SERIAL_UNHANDLED_MESSAGE': {
      const source = asText(details.source);
      if (source === 'command') {
        const message = asText(details.message);
        const pin = asNumber(details.pin);
        const action = asText(details.action);
        const pinText = pin === null ? '' : ` pin=${pin}`;
        const actionText = action ? ` action=${action}` : '';
        return `Messaggio command non gestito${pinText}${actionText}${message ? `: ${message}` : ''}.`;
      }

      const raw = asText(details.raw);
      return raw
        ? `Messaggio JSON seriale non gestito: ${raw}.`
        : 'Messaggio seriale non gestito.';
    }
    default:
      return `${event.category}/${event.eventType}`;
  }
}
