#include <Arduino.h>

const int SENSOR_PINS[] = {A0, A1, A2, A3, A4};
const int RELAY_PINS[] = {2, 3, 4, 5, 6};
const int NUM_PLANTS = 5;
const int PUMP_ENABLE_LEVEL = LOW;
const int PUMP_DISABLE_LEVEL = HIGH;

unsigned long pumpStartTime[NUM_PLANTS] = {0, 0, 0, 0, 0};
bool isPumpActive[NUM_PLANTS] = {false, false, false, false, false};

unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 500;

String escapeJson(String value);

int relayIndexFromPin(int pin)
{
  for (int i = 0; i < NUM_PLANTS; i++)
  {
    if (RELAY_PINS[i] == pin)
      return i;
  }
  return -1;
}

void setup()
{
  Serial.begin(115200);

  for (int i = 0; i < NUM_PLANTS; i++)
  {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], PUMP_DISABLE_LEVEL);
    isPumpActive[i] = false;
    pumpStartTime[i] = 0;
  }

  Serial.flush();
  Serial.print(F("{\"type\":\"status\",\"message\":\"Sistema pronto. In attesa di comandi...\"}\n"));
}

String escapeJson(String value)
{
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  value.replace("\n", " ");
  value.replace("\r", " ");
  return value;
}

void sendResponse(const String &status, const String &message, int pin = -1, const String &action = "")
{
  Serial.print(F("{\"type\":\"command\",\"status\":\""));
  Serial.print(escapeJson(status));
  Serial.print(F("\",\"message\":\""));
  Serial.print(escapeJson(message));

  if (pin >= 0)
  {
    Serial.print(F("\",\"pin\":"));
    Serial.print(pin);
  }
  else
  {
    Serial.print(F("\""));
  }

  if (action.length() > 0)
  {
    Serial.print(F(",\"action\":\""));
    Serial.print(escapeJson(action));
    Serial.print(F("\""));
  }

  Serial.print(F("}\n"));
  Serial.flush();
}

void readAndSendSensor()
{
  int raw = analogRead(A0);
  int clampedRaw = constrain(raw, 250, 610);
  int moisturePercent = map(clampedRaw, 250, 610, 100, 0);
  Serial.print(F("{\"type\":\"telemetry\",\"id\":\"1\",\"moisture\":"));
  Serial.print(moisturePercent);
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
    sendResponse("error", "formato non valido");
    return;
  }

  String prefisso = comando.substring(0, firstSep);
  String pinStr = comando.substring(firstSep + 1, secondSep);
  String azione = comando.substring(secondSep + 1);

  if (prefisso != "PUMP")
  {
    sendResponse("error", "prefisso non valido");
    return;
  }

  int pin = pinStr.toInt();
  int relayIdx = relayIndexFromPin(pin);
  if (relayIdx < 0)
  {
    sendResponse("error", "pin non valido", pin, azione);
    return;
  }

  if (azione == "ON")
  {
    digitalWrite(pin, PUMP_ENABLE_LEVEL);
    isPumpActive[relayIdx] = true;
    pumpStartTime[relayIdx] = millis();
    sendResponse("ok", "pompa attivata (pin LOW)", pin, azione);
  }
  else if (azione == "OFF")
  {
    digitalWrite(pin, PUMP_DISABLE_LEVEL);
    isPumpActive[relayIdx] = false;
    pumpStartTime[relayIdx] = 0;
    sendResponse("ok", "pompa disattivata (pin HIGH)", pin, azione);
  }
  else
  {
    sendResponse("error", "azione non valida", pin, azione);
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