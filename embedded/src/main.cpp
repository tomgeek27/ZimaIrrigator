#include <Arduino.h>

const int SENSOR_PINS[] = {A0, A1, A2, A3, A4};
const int RELAY_PINS[] = {2, 3, 4, 5, 6};
const int NUM_PLANTS = 5;

// --- CONFIGURAZIONE SICUREZZA ---
const unsigned long PUMP_MAX_DURATION = 8000; // Massimo 8 secondi di irrigazione continua consentiti
const unsigned long SERIAL_TIMEOUT = 10000;   // Se non riceve dati per 10 secondi, va in blocco

unsigned long pumpStartTime[NUM_PLANTS] = {0, 0, 0, 0, 0};
bool isPumpActive[NUM_PLANTS] = {false, false, false, false, false};
unsigned long lastSerialRxTime = 0; // Timestamp dell'ultimo messaggio ricevuto valido

// void spegniTutteLePompe()
// {
//   for (int i = 0; i < NUM_PLANTS; i++)
//   {
//     digitalWrite(RELAY_PINS[i], HIGH); // Spegni (Active HIGH)
//     isPumpActive[i] = false;
//   }
// }

// void setup()
// {
//   Serial.begin(9600);
//   for (int i = 0; i < NUM_PLANTS; i++)
//   {
//     pinMode(RELAY_PINS[i], OUTPUT);
//   }
//   spegniTutteLePompe();
//   lastSerialRxTime = millis(); // Inizializza il timer di comunicazione
// }

// void loop()
// {
//   unsigned long currentTime = millis();

//   // 1. INVIO METRICHE AL SERVER
//   Serial.print("{\"moisture\":[");
//   for (int i = 0; i < NUM_PLANTS; i++)
//   {
//     int raw = analogRead(SENSOR_PINS[i]);
//     int percent = constrain(map(raw, 800, 400, 0, 100), 0, 100);
//     Serial.print(percent);
//     if (i < NUM_PLANTS - 1)
//       Serial.print(",");
//   }
//   Serial.println("]}");

//   // 2. CONTROLLO TIMEOUT LOCALE DELLE POMPE (Protezione allagamento)
//   for (int i = 0; i < NUM_PLANTS; i++)
//   {
//     if (isPumpActive[i] && (currentTime - pumpStartTime[i] >= PUMP_MAX_DURATION))
//     {
//       digitalWrite(RELAY_PINS[i], HIGH); // Forza lo spegnimento hardware
//       isPumpActive[i] = false;
//       // Opzionale: invia un log di errore al server
//       Serial.println("{\"error\":\"TIMEOUT_POMPA_FORZATO\",\"id\":" + String(i + 1) + "}");
//     }
//   }

//   // 3. WATCHDOG DELLA COMUNICAZIONE SERIALE (Protezione disconnessione cavo)
//   if (currentTime - lastSerialRxTime >= SERIAL_TIMEOUT)
//   {
//     spegniTutteLePompe();
//     Serial.println("{\"warning\":\"WATCHDOG_RESET_SERIAL_LOST\"}");
//     // Non blocchiamo il loop, ma resettiamo il timer per evitare spam di log,
//     // restando in attesa che il server si riconnetta
//     lastSerialRxTime = currentTime;
//   }

//   // 4. GESTIONE COMANDI IN INGRESSO
//   if (Serial.available() > 0)
//   {
//     String cmd = Serial.readStringUntil('\n');
//     cmd.trim();

//     // Ogni messaggio valido (anche un semplice comando "PING" vuoto dal server) resetta il Watchdog
//     lastSerialRxTime = millis();

//     if (cmd.startsWith("P") && cmd.length() >= 5)
//     {
//       int idx = cmd.substring(1, 2).toInt() - 1;
//       if (idx >= 0 && idx < NUM_PLANTS)
//       {
//         if (cmd.endsWith("ON") && !isPumpActive[idx])
//         {
//           digitalWrite(RELAY_PINS[idx], LOW); // Accendi pompa
//           isPumpActive[idx] = true;
//           pumpStartTime[idx] = millis(); // Salva il timestamp di accensione
//         }
//         if (cmd.endsWith("OFF"))
//         {
//           digitalWrite(RELAY_PINS[idx], HIGH); // Spegni pompa
//           isPumpActive[idx] = false;
//         }
//       }
//     }
//   }

//   delay(2000);
// }

unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 500;

void setup()
{
  Serial.begin(115200);
  Serial.flush();
  Serial.print(F("Sistema pronto. In attesa di comandi...\n"));
}

void sendResponse(const __FlashStringHelper *msg)
{
  Serial.print(msg);
  Serial.print('\n');
  Serial.flush();
}

void readAndSendSensor()
{
  int raw = analogRead(A0);
  Serial.print(F("{\"id\":\"1\",\"moisture\":"));
  Serial.print(raw);
  Serial.print(F(",\"arduino_ms\":"));
  Serial.print(millis()); // vedi il timing reale lato Arduino
  Serial.print(F("}\n"));
  Serial.flush();
}

void processCommand(String comando)
{
  comando.trim();

  int firstSep = comando.indexOf(':');
  int secondSep = comando.indexOf(':', firstSep + 1);

  if ((firstSep <= 0) || (secondSep <= firstSep) || (comando.indexOf(':', secondSep + 1) != -1))
  {
    sendResponse(F("ERRORE: formato non valido"));
    return;
  }

  String prefisso = comando.substring(0, firstSep);
  String pinStr = comando.substring(firstSep + 1, secondSep);
  String azione = comando.substring(secondSep + 1);

  if (prefisso != "PUMP")
  {
    sendResponse(F("ERRORE: prefisso non valido"));
    return;
  }

  int pin = pinStr.toInt();
  if (pin <= 0)
  {
    sendResponse(F("ERRORE: pin non valido"));
    return;
  }

  pinMode(pin, OUTPUT);

  if (azione == "ON")
  {
    digitalWrite(pin, HIGH);
    sendResponse(F("OK: pin acceso"));
  }
  else if (azione == "OFF")
  {
    digitalWrite(pin, LOW);
    sendResponse(F("OK: pin spento"));
  }
  else
  {
    sendResponse(azione);
    sendResponse(F("ERRORE: azione non valida"));
  }
}

void loop()
{
  unsigned long now = millis();

  // Lettura sensore non bloccante ogni 500ms
  if (now - lastSensorRead >= SENSOR_INTERVAL)
  {
    lastSensorRead = now;
    readAndSendSensor();
  }

  // Gestione comandi in ingresso
  if (Serial.available() > 0)
  {
    String comando = Serial.readStringUntil('\n');
    while (Serial.available() > 0)
      Serial.read();
    processCommand(comando);
  }
}