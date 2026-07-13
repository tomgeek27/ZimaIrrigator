import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { sql } from './db.ts';
import process from 'process';
import { execSync } from 'child_process';

interface PlantConfig {
  id: string;
  name: string;
  moistureMin: number;
  moistureMax: number;
  autoEnabled: boolean;
  startEnabled: boolean;
  stopEnabled: boolean;
  relayPin: number;
}

interface PlantState {
  config: PlantConfig;
  currentMoisture: number;
  pumpActive: boolean;
}

// Stato cache volatile in RAM per la gestione real-time dei WebSocket
let plantsCache: Record<string, PlantState> = {};

const fastify = Fastify({ logger: false });
fastify.register(fastifyCors, { origin: "*" });
await fastify.register(websocketPlugin);

// --- FUNZIONE DI BROADCAST PER I WEBSOCKET ---
function broadcastUpdate(type: 'UPDATE' | 'INIT', customData?: any) {
  const payload = JSON.stringify({
    type,
    data: customData || plantsCache
  });
  for (const client of fastify.websocketServer.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

// --- BROADCAST LOG (per eventi Arduino/seriale/sistema) ---
type LogLevel = 'info' | 'warning' | 'error';

function broadcastLog(message: string, level: LogLevel = 'info') {
  const payload = JSON.stringify({
    type: 'LOG',
    data: {
      message,
      level,
      timestamp: Date.now()
    }
  });
  for (const client of fastify.websocketServer.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

// --- LOGICA DI AUTOMAZIONE (ISTERESI) E SALVATAGGIO DB ---
async function handleNewTelemetry(id: string, moisture: number) {
  if (!plantsCache[id]) return;

  plantsCache[id].currentMoisture = moisture;
  const plant = plantsCache[id];
  const { autoEnabled, moistureMin, moistureMax, startEnabled, stopEnabled } = plant.config;

  let stateChanged = false;
  let reason = "";
  let triggerType: 'MANUAL' | 'AUTOMATIC' = 'AUTOMATIC';

  if (autoEnabled) {
    // Condizione di ACCENSIONE
    if (startEnabled && !plant.pumpActive && moisture < moistureMin) {
      plant.pumpActive = true;
      stateChanged = true;
      reason = "Automazione (Soglia Minima Superata)";
    }
    // Condizione di SPEGNIMENTO
    else if (stopEnabled && plant.pumpActive && moisture > moistureMax) {
      plant.pumpActive = false;
      stateChanged = true;
      reason = "Automazione (Soglia Massima Raggiunta)";
    }
  }

  const timestamp = Date.now();

  // 1. Salva la lettura al minuto nello storico Postgres
  await sql`
    INSERT INTO plant_history (plant_id, moisture, pump_state, timestamp)
    VALUES (${id}, ${moisture}, ${plant.pumpActive ? 1 : 0}, ${timestamp})
  `;

  // 2. Se l'isteresi ha cambiato lo stato della pompa, invia il comando seriale e scrivi il Log nel DB
  if (stateChanged) {
    sendSerialCommand(plant.config.relayPin, `${plant.pumpActive ? 'ON' : 'OFF'}`);

    await sql`
      INSERT INTO irrigation_logs (plant_id, event_type, trigger_type, message, timestamp)
      VALUES (${id}, ${plant.pumpActive ? 'PUMP_ON' : 'PUMP_OFF'}, ${triggerType}, ${reason}, ${timestamp})
    `;
  }

  // 3. Spingi l'aggiornamento grafico immediato alla dashboard React
  broadcastUpdate('UPDATE');
}

function sendSerialCommand(relayPin: number, state: string) {
  if (port && port.writable) {
    port.write(`PUMP:${relayPin}:${state}\n`);
    console.log(`[SERIAL RAW] "${`PUMP:${relayPin}:${state}`}" inviato ad Arduino`);
  }
}

// --- APERTURA CONNESSIONE ARDUINO (SERIALE) ---
const ARDUINO_PORT = process.env.SERIAL_PORT || '/dev/ttyACM0';
let port: SerialPort | null = null;

try {
  execSync(`stty -F ${ARDUINO_PORT} raw speed 115200 -echo min 1 time 0`);
  console.log('[SERIAL] stty configurato');
} catch (e) {
  console.warn('[SERIAL] stty fallito, continuo comunque');
}

try {
  port = new SerialPort({
    path: ARDUINO_PORT,
    baudRate: 115200,
    highWaterMark: 64 // default è 64KB, abbassalo a 64 byte
  });

  const parser = port.pipe(new ReadlineParser({
    delimiter: '\n',
    encoding: 'utf8',
    readableHighWaterMark: 64  // <-- anche qui
  }));

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

      setTimeout(() => {
        port!.write(`TIME:${Math.floor(Date.now() / 1000)}\n`);
      }, 500);
    });
  });
  // port.on('data', (raw: Buffer) => {
  //   console.log(`[ARDUINO RAW]`, JSON.stringify(raw.toString()));
  // });

  // Salva il momento in cui Arduino si è connesso
  let arduinoEpoch: number | null = null;

  parser.on('data', async (data: string) => {
    try {
      const parsed = JSON.parse(data);

      if (arduinoEpoch === null) {
        arduinoEpoch = Date.now() - parsed.arduino_ms;
        console.log(`[SERIAL] Arduino epoch calcolato: ${new Date(arduinoEpoch).toISOString()}`);
        broadcastLog(`Arduino sincronizzato (epoch: ${new Date(arduinoEpoch).toISOString()})`, 'info');
      }

      const realTs = new Date(arduinoEpoch + parsed.arduino_ms).toISOString();
      parsed.ts = realTs;

      console.log(`[ARDUINO] ${JSON.stringify(parsed)}`);
      broadcastLog(`Telemetria [${parsed.id}]: umidità ${parsed.moisture}%`, 'info');

      await handleNewTelemetry(parsed.id, parsed.moisture);
    } catch (err) {
      console.log(`[ARDUINO] ${data.trim()}`);
      broadcastLog(`Riga seriale non JSON: ${data.trim()}`, 'warning');
    }
  });

} catch (e) {
  console.log(`⚠️ Arduino non trovato su ${ARDUINO_PORT}. Attivazione simulatore di telemetria al minuto.`);
}

// --- ROTTE APPLICATIVE (API REST + WEBSOCKET) ---

// GET: Recupera la lista di tutte le piante e la loro configurazione attuale
fastify.get('/api/plants', async (request, reply) => {
  return plantsCache;
});

// WebSocket unico per aggiornamenti istantanei delle telemetrie
fastify.get('/ws', { websocket: true }, (socket, request) => {
  //console.log('DEBUG socket type:', socket?.constructor?.name, 'has send?', typeof socket?.send);
  socket.send(JSON.stringify({ type: 'INIT', data: plantsCache }));
});

// GET: Recupera lo storico filtrato temporalmente (chiamato dal frontend per i grafici personalizzati)
fastify.get('/api/history/:plantId', async (request, reply) => {
  const { plantId } = request.params as { plantId: string };
  const { timeframe } = request.query as { timeframe?: string };

  let timeLimit = Date.now() - (24 * 60 * 60 * 1000); // Default: ultime 24 ore
  if (timeframe === '30m') timeLimit = Date.now() - (30 * 60 * 1000);
  if (timeframe === '1h') timeLimit = Date.now() - (1 * 60 * 60 * 1000);
  if (timeframe === '12h') timeLimit = Date.now() - (12 * 60 * 60 * 1000);
  if (timeframe === '3d') timeLimit = Date.now() - (3 * 24 * 60 * 60 * 1000);
  if (timeframe === '7d') timeLimit = Date.now() - (7 * 24 * 60 * 60 * 1000);

  const history = await sql`
    SELECT moisture, pump_state as "pumpState", timestamp 
    FROM plant_history 
    WHERE plant_id = ${plantId} AND timestamp >= ${timeLimit}
    ORDER BY timestamp ASC
  `;
  return history;
});

// GET: Recupera la lista completa di tutti i log degli eventi persistiti
fastify.get('/api/logs/:plantId', async (request) => {
  const { plantId } = request.params as { plantId: string };
  return await sql`
    SELECT event_type as "eventType", trigger_type as "triggerType", message, timestamp 
    FROM irrigation_logs 
    WHERE plant_id = ${plantId}
    ORDER BY timestamp DESC 
    LIMIT 100
  `;
});

// POST: Aggiorna le soglie di taratura dell'Isteresi e le salva permanentemente
fastify.post('/api/config', async (request, reply) => {
  const body = request.body as PlantConfig;

  if (!plantsCache[body.id]) return reply.code(404).send({ error: 'Pianta non trovata' });

  // Update su database Postgres
  await sql`
    UPDATE plant_config SET
      moisture_min = ${body.moistureMin},
      moisture_max = ${body.moistureMax},
      auto_enabled = ${body.autoEnabled},
      start_enabled = ${body.startEnabled},
      stop_enabled = ${body.stopEnabled}
    WHERE id = ${body.id}
  `;

  // Aggiorna la RAM locale del server
  plantsCache[body.id].config = body;
  broadcastUpdate('UPDATE');
  return { success: true };
});

// POST: Trigger di accensione/spegnimento manuale da Dashboard
fastify.post('/api/pump', async (request, reply) => {
  const { relayPin, active } = request.body as { relayPin: number, active: string };

  sendSerialCommand(relayPin, active);

  return { success: true }
});

fastify.get('/api/health', async (request, reply) => {
  const uptime = process.uptime();

  const healthStatus = {
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime)}s`,
    services: {
      server: "up",
    }
  };

  // Se tutto è OK, restituiamo 200
  return reply.status(200).send(healthStatus);
});

// --- INIZIALIZZAZIONE SERVER ---
const start = async () => {
  try {
    // 2. Sincronizziamo la cache RAM del server caricando l'ultimo stato salvato nel database
    const dbConfigs = await sql`SELECT id, name, moisture_min, moisture_max, auto_enabled, start_enabled, stop_enabled, relay_pin FROM plant_config`;

    console.log(dbConfigs)

    for (const row of dbConfigs) {
      plantsCache[row.id] = {
        config: {
          id: row.id,
          name: row.name,
          moistureMin: row.moisture_min,
          moistureMax: row.moisture_max,
          autoEnabled: row.auto_enabled,
          startEnabled: row.start_enabled,
          stopEnabled: row.stop_enabled,
          relayPin: row.relay_pin,
        },
        currentMoisture: 50, // Verrà sovrascritto dalla prima lettura utile di Arduino
        pumpActive: false
      };
    }

    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log("🚀 Fastify + Postgres Backend attivo sulla porta 3001");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();

// --- SIMULATORE DI TELEMETRIA DI FALLBACK (Esegue una lettura al minuto se Arduino è scollegato) ---
if (!port) {
  setInterval(async () => {
    console.log("⏱️ Polling al minuto (Simulazione)...");
    for (const id in plantsCache) {
      const plant = plantsCache[id];
      let nextMoisture = plant.currentMoisture;
      if (plant.pumpActive) {
        nextMoisture = Math.min(100, nextMoisture + 8);
      } else {
        nextMoisture = Math.max(0, nextMoisture - Math.floor(Math.random() * 3));
      }
      await handleNewTelemetry(id, nextMoisture);
    }
  }, 60000); // 60000ms = 1 Minuto esatto
}