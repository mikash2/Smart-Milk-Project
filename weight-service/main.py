import paho.mqtt.client as mqtt
import time
import random  # For simulation, replace with actual HX711 code
import os  # Add this import

# Use environment variables instead of hardcoded values
MQTT_HOST = os.getenv("MQTT_HOST", "smart-milk-mosquitto-service")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "milk/weight")

client = mqtt.Client()

def connect_mqtt():
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT)
            print(f"Connected to MQTT Broker at {MQTT_HOST}:{MQTT_PORT}!")
            return
        except Exception as e:
            print(f"Connection failed: {e}, retrying...")
            time.sleep(5)

def simulate_weight():
    """Simulate weight data (replace with actual HX711 reading)"""
    base_weight = 1000  # grams (full container)
    current_weight = max(0, base_weight - random.randint(0, 100))
    return current_weight

def publish_weight():
    while True:
        weight = simulate_weight()
        client.publish(MQTT_TOPIC, payload=str(weight), qos=1)
        print(f"Published weight: {weight}g")
        time.sleep(10)  # Send every 10 seconds

if __name__ == "__main__":
    connect_mqtt()
    client.loop_start()
    publish_weight()