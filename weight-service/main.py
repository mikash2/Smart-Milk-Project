import paho.mqtt.client as mqtt
import time
import random
from datetime import datetime

# MQTT Configuration
MQTT_HOST = "smart-milk-mosquitto-service"
MQTT_PORT = 1883
MQTT_TOPIC = "milk/weight"

def log_with_timestamp(message, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    print(f"[{timestamp}] [{level}] [WEIGHT-SERVICE] {message}")

log_with_timestamp("🚀 Smart Milk Weight Service Starting...")
log_with_timestamp(f"📡 MQTT Configuration - Host: {MQTT_HOST}, Port: {MQTT_PORT}, Topic: {MQTT_TOPIC}")

client = mqtt.Client()

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        log_with_timestamp("✅ Successfully connected to MQTT broker!", "SUCCESS")
        log_with_timestamp("📊 Ready to start publishing weight data every 10 seconds")
    else:
        log_with_timestamp(f"❌ Connection failed with return code: {rc}", "ERROR")

def on_disconnect(client, userdata, rc):
    log_with_timestamp(f"🔌 Disconnected from MQTT broker (return code: {rc})", "WARNING")

def on_publish(client, userdata, mid):
    log_with_timestamp(f"📤 Message {mid} successfully delivered to broker", "SUCCESS")

def on_log(client, userdata, level, buf):
    log_with_timestamp(f"🔍 MQTT Client Log: {buf}", "DEBUG")

client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_publish = on_publish
client.on_log = on_log

def connect_mqtt():
    log_with_timestamp(f"🔄 Attempting to connect to MQTT broker at {MQTT_HOST}:{MQTT_PORT}")
    
    while True:
        try:
            log_with_timestamp(f"🔗 Initiating connection to {MQTT_HOST}:{MQTT_PORT}...")
            client.connect(MQTT_HOST, MQTT_PORT)
            log_with_timestamp("🔗 Connection request sent, waiting for callback...")
            return
        except Exception as e:
            log_with_timestamp(f"❌ Connection attempt failed: {e}", "ERROR")
            log_with_timestamp("⏰ Retrying connection in 5 seconds...", "WARNING")
            time.sleep(5)

def simulate_weight():
    """Simulate weight data (replace with actual HX711 reading)"""
    base_weight = 1000  # grams (full container)
    current_weight = max(0, base_weight - random.randint(0, 100))
    return current_weight

def publish_weight():
    message_count = 0
    log_with_timestamp("🎯 Starting weight publishing loop...")
    
    while True:
        try:
            weight = simulate_weight()
            message_count += 1
            
            log_with_timestamp(f"⚖️  Simulated weight reading: {weight}g (Reading #{message_count})")
            
            # Publish to MQTT
            log_with_timestamp(f"📡 Publishing to topic '{MQTT_TOPIC}': {weight}g")
            result = client.publish(MQTT_TOPIC, payload=str(weight), qos=1)
            
            if result.rc == 0:
                log_with_timestamp(f"📤 Weight data queued for publishing (Message ID: {result.mid})")
            else:
                log_with_timestamp(f"❌ Failed to queue message (return code: {result.rc})", "ERROR")
                
            log_with_timestamp(f"⏰ Waiting 10 seconds before next reading...")
            log_with_timestamp("=" * 80)
            time.sleep(10)
            
        except Exception as e:
            log_with_timestamp(f"💥 Error in publishing loop: {e}", "ERROR")
            log_with_timestamp("⏰ Retrying in 5 seconds...", "WARNING")
            time.sleep(5)

if __name__ == "__main__":
    log_with_timestamp("🍼 Smart Milk Weight Service Initializing...")
    
    try:
        connect_mqtt()
        log_with_timestamp("🔄 Starting MQTT client loop...")
        client.loop_start()
        log_with_timestamp("✅ MQTT client loop started successfully")
        
        publish_weight()
        
    except KeyboardInterrupt:
        log_with_timestamp("🛑 Service stopped by user", "INFO")
        client.loop_stop()
        client.disconnect()
    except Exception as e:
        log_with_timestamp(f"💥 Fatal error: {e}", "ERROR")
        raise