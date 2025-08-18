// firmware/milk_sensor/milk_sensor.ino
#include <WiFi.h>
#include <PubSubClient.h>
#include "HX711.h"

// Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "YOUR_MQTT_BROKER_IP"; // Use your Docker host IP
const int mqtt_port = 1883;
const char* mqtt_topic = "milk/weight";

// Hardware pins
#define DOUT 21
#define CLK  22

HX711 scale;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ========== SETUP ========== //
void setup() {
  Serial.begin(115200);
  setupWiFi();
  setupMQTT();
  setupScale();
}

void setupWiFi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void setupMQTT() {
  mqttClient.setServer(mqtt_server, mqtt_port);
}

void setupScale() {
  scale.begin(DOUT, CLK);
  scale.set_scale(-420.0);  // Calibration factor
  scale.tare();             // Reset to zero
}

// ========== MAIN LOOP ========== //
void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  float weight = readWeight();
  publishWeight(weight);
  
  delay(10000);  // Send every 10 seconds
}

// ========== HELPER FUNCTIONS ========== //
float readWeight() {
  float raw = scale.get_units(5);
  return max(0, raw);  // Ensure non-negative
}

void publishWeight(float weight) {
  char payload[20];
  dtostrf(weight, 6, 2, payload);
  
  if (mqttClient.publish(mqtt_topic, payload)) {
    Serial.print("Published: ");
    Serial.print(weight);
    Serial.println("g");
  } else {
    Serial.println("Publish failed!");
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    if (mqttClient.connect("milk_sensor")) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("MQTT failed, rc=");
      Serial.print(mqttClient.state());
      delay(5000);
    }
  }
}