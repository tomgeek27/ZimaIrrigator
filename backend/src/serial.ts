import { execSync } from 'child_process';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { broadcastLog } from './broadcast.ts';

const ARDUINO_PORT = process.env.SERIAL_PORT || '/dev/ttyACM0';

let port: SerialPort | null = null;
let arduinoEpoch: number | null = null;

interface TelemetryMessage {
  type?: 'telemetry';
  id: string;
  moisture: number;
  arduino_ms: number;
}

interface CommandMessage {
  type: 'command';
  status: 'ok' | 'error';
  message: string;
  pin?: number;
  action?: string;
}

interface StatusMessage {
  type: 'status';
  message: string;
}

type ArduinoMessage = TelemetryMessage | CommandMessage | StatusMessage;

function isTelemetryMessage(msg: any): msg is TelemetryMessage {
  return (
    msg &&
    typeof msg.id === 'string' &&
    typeof msg.moisture === 'number' &&
    typeof msg.arduino_ms === 'number'
  );
}

export function isSerialConnected(): boolean {
  return port !== null;
}

export function sendSerialCommand(relayPin: number, state: 'ON' | 'OFF'): void {
  if (port?.writable) {
    const command = `PUMP:${relayPin}:${state}`;
    port.write(`${command}\n`);
    console.log(`[SERIAL RAW] "${command}" inviato ad Arduino`);
  }
}

/**
 * Apre la connessione seriale con Arduino e registra il callback da invocare
 * per ogni pacchetto di telemetria valido ricevuto (id pianta + umidità).
 * Ritorna false se la porta seriale non è disponibile (es. dev in corso senza
 * hardware collegato): in quel caso il chiamante può attivare un simulatore.
 */
export function connectSerial(onTelemetry: (plantId: string, moisture: number) => Promise<void>): boolean {
  try {
    execSync(`stty -F ${ARDUINO_PORT} raw speed 115200 -echo min 1 time 0`);
    console.log('[SERIAL] stty configurato');
  } catch {
    console.warn('[SERIAL] stty fallito, continuo comunque');
  }

  try {
    port = new SerialPort({
      path: ARDUINO_PORT,
      baudRate: 115200,
      highWaterMark: 64,
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n', encoding: 'utf8', readableHighWaterMark: 64 }));

    console.log(`📡 Connettore Seriale attivo su: ${ARDUINO_PORT}`);

    port.on('open', () => {
      port!.flush((err) => {
        if (err) {
          console.error('[SERIAL] Flush error:', err);
          broadcastLog('Errore flush buffer seriale.', 'error');
        } else {
          console.log('[SERIAL] Buffer svuotato');
          broadcastLog('Connessione Arduino stabilita, buffer svuotato.', 'info');
        }
        setTimeout(() => port!.write(`TIME:${Math.floor(Date.now() / 1000)}\n`), 500);
      });
    });

    parser.on('data', async (line: string) => {
      let parsed: ArduinoMessage;
      try {
        parsed = JSON.parse(line);
      } catch {
        console.log(`[ARDUINO] ${line.trim()}`);
        broadcastLog(`Riga seriale non JSON: ${line.trim()}`, 'warning');
        return;
      }

      if (isTelemetryMessage(parsed)) {
        if (arduinoEpoch === null) {
          arduinoEpoch = Date.now() - parsed.arduino_ms;
          console.log(`[SERIAL] Arduino epoch calcolato: ${new Date(arduinoEpoch).toISOString()}`);
          broadcastLog(`Arduino sincronizzato (epoch: ${new Date(arduinoEpoch).toISOString()})`, 'info');
        }

        const ts = new Date(arduinoEpoch + parsed.arduino_ms).toISOString();
        console.log(`[ARDUINO] ${JSON.stringify({ ...parsed, ts })}`);
        broadcastLog(`Telemetria [${parsed.id}]: umidità ${parsed.moisture}%`, 'info');

        await onTelemetry(parsed.id, parsed.moisture);
        return;
      }

      if (parsed.type === 'command') {
        const level = parsed.status === 'error' ? 'warning' : 'info';
        const pinInfo = typeof parsed.pin === 'number' ? ` pin=${parsed.pin}` : '';
        const actionInfo = parsed.action ? ` action=${parsed.action}` : '';
        console.log(`[ARDUINO] ${JSON.stringify(parsed)}`);
        broadcastLog(`[ARDUINO CMD] ${parsed.message}${pinInfo}${actionInfo}`, level);
        return;
      }

      if (parsed.type === 'status') {
        console.log(`[ARDUINO] ${JSON.stringify(parsed)}`);
        broadcastLog(`[ARDUINO STATUS] ${parsed.message}`, 'info');
        return;
      }

      console.log(`[ARDUINO] JSON non gestito: ${line.trim()}`);
      broadcastLog(`Messaggio JSON seriale non gestito: ${line.trim()}`, 'warning');
    });

    return true;
  } catch {
    console.log(`⚠️ Arduino non trovato su ${ARDUINO_PORT}. Attivazione simulatore di telemetria al minuto.`);
    port = null;
    return false;
  }
}
