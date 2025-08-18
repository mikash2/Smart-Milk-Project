#include <WiFi.h>
#include <PubSubClient.h>
#include "HX711.h"

// WiFi credentials
const char* ssid = "your_SSID";
const char* password = "your_PASSWORD";

// MQTT Broker
const char* mqtt_server = "your_mqtt_broker_ip";
const int mqtt_port = 1883;
const char* mqtt_topic = "milk/weight";

// HX711 setup
#define DOUT 21
#define CLK  22
HX711 scale;

WiFiClient espClient;
PubSubClient client(espClient);

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("arduinoClient")) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);

  scale.begin(DOUT, CLK);
  scale.set_scale(-420.0);  // Calibration factor
  scale.tare();             // Reset scale to 0
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  float weight = scale.get_units(5);  // Get weight in grams
  if (weight < 0) weight = 0;        // Ensure non-negative

  char payload[20];
  dtostrf(weight, 6, 2, payload);
  
  client.publish(mqtt_topic, payload);
  Serial.print("Published: ");
  Serial.print(weight);
  Serial.println("g");

  delay(10000);  // Send every 10 seconds
}