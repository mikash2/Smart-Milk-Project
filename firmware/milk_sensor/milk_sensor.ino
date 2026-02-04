#include <WiFi.h>
#include <PubSubClient.h>
#include "HX711.h"

// ===== USER CONFIG =====
const char* ssid        = "Home";
const char* password    = "10203040";
// Set to your PC's LAN IP (where Docker runs Mosquitto)
const char* mqtt_server = "192.168.1.188";
const int   mqtt_port   = 1883;
const char* mqtt_topic  = "milk/weight";   // or "milk/weight/device1"
const char* device_id   = "device1";       // must exist in DB 'clients'

// HX711 pins & calibration
#define DOUT 21
#define CLK  22
float CALIB_FACTOR = -420.0;

HX711 scale;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ---------- Helpers ----------
void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.print("\nWiFi OK. IP="); Serial.println(WiFi.localIP());
}

void setupMQTT() {
  mqttClient.setServer(mqtt_server, mqtt_port);
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("MQTT connecting...");
    if (mqttClient.connect("milk_sensor_client")) {
      Serial.println(" connected");
    } else {
      Serial.print(" failed, rc="); Serial.print(mqttClient.state());
      Serial.println(" retry 5s"); delay(5000);
    }
  }
}

void setupScale() {
  scale.begin(DOUT, CLK);
  scale.set_scale(CALIB_FACTOR);
  scale.tare();
  Serial.println("Scale ready.");
}

float readWeight() {
  float g = scale.get_units(5);
  return g < 0 ? 0 : g;
}

void publishWeight(float weight) {
  unsigned long t = millis() / 1000;
  char payload[128];
  snprintf(payload, sizeof(payload),
    "{\"device_id\":\"%s\",\"weight\":%.2f,\"timestamp\":%lu}",
    device_id, weight, t);

  if (mqttClient.publish(mqtt_topic, payload)) {
    Serial.print("Published: "); Serial.println(payload);
  } else {
    Serial.println("Publish failed!");
  }
}

// ---------- Arduino ----------
void setup() {
  Serial.begin(115200);
  setupWiFi();
  setupMQTT();
  setupScale();
}

void loop() {
  if (!mqttClient.connected()) reconnectMQTT();
  mqttClient.loop();

  float w = readWeight();
  publishWeight(w);

  delay(10000); // every 10s
}
