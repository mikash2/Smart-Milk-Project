import paho.mqtt.client as mqtt
import time
import random
import json
import os
from datetime import datetime

# MQTT Configuration
MQTT_HOST = "smart-milk-mosquitto-service"
MQTT_PORT = 1883
MQTT_TOPIC = "milk/weight"

# Device Configuration
DEVICE_ID = os.getenv("DEVICE_ID", "device1")

client = mqtt.Client()

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[weight] Connected to MQTT broker successfully", flush=True)
    else:
        print(f"[weight] ERROR - Connection failed (rc: {rc})", flush=True)

def on_disconnect(client, userdata, rc):
    print(f"[weight] Disconnected from MQTT broker (rc: {rc})", flush=True)

def on_publish(client, userdata, mid):
    print(f"[weight] Message {mid} successfully delivered to broker", flush=True)

# Set only the callbacks we want
client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_publish = on_publish

def connect_mqtt():
    print(f"[weight] Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT}", flush=True)
    
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT)
            return
        except Exception as e:
            print(f"[weight] Connection failed: {e}. Retrying in 5s...", flush=True)
            time.sleep(5)

def simulate_weight():
    """Simulate weight data (replace with actual HX711 reading)"""
    base_weight = 1000  # grams (full container)
    current_weight = max(0, base_weight - random.randint(0, 100))
    return current_weight

def publish_weight():
    message_count = 0
    print("[weight] Starting weight publishing loop...", flush=True)
    
    while True:
        try:
            weight = simulate_weight()
            message_count += 1
            
            # Create JSON payload with device_id, weight, and unique message ID
            payload_data = {
                "device_id": DEVICE_ID,
                "weight": weight,
                "timestamp": datetime.now().isoformat(),
                "message_id": f"weight-{message_count}-{int(time.time())}"
            }
            payload_json = json.dumps(payload_data)
            
            # Simple log - just the essential data
            print(f"[weight] Message #{message_count}: Sent device {DEVICE_ID}, weight {weight}g, msg_id: {payload_data['message_id']}", flush=True)
            
            result = client.publish(MQTT_TOPIC, payload=payload_json, qos=1)
            
            if result.rc != 0:
                print(f"[weight] Message #{message_count}: ERROR - Failed to queue message (rc: {result.rc})", flush=True)
                
            time.sleep(10)
            
        except Exception as e:
            print(f"[weight] Message #{message_count}: ERROR - {e}", flush=True)
            time.sleep(5)

if __name__ == "__main__":
    print("[weight] Smart Milk Weight Service Starting...", flush=True)
    
    try:
        connect_mqtt()
        print("[weight] Starting MQTT client loop...", flush=True)
        client.loop_start()
        
        publish_weight()
        
    except KeyboardInterrupt:
        print("[weight] Service stopped by user", flush=True)
        client.loop_stop()
        client.disconnect()
    except Exception as e:
        print(f"[weight] Fatal error: {e}", flush=True)
        raise