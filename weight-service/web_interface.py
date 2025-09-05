import paho.mqtt.client as mqtt
import json
import os
import threading
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# MQTT Configuration
MQTT_HOST = "smart-milk-mosquitto-service"
MQTT_PORT = 1883
MQTT_TOPIC = "milk/weight"

# Device Configuration
DEVICE_ID = os.getenv("DEVICE_ID", "device1")

# Global MQTT client
client = mqtt.Client()
message_count = 0

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[weight-web] Connected to MQTT broker successfully", flush=True)
    else:
        print(f"[weight-web] ERROR - Connection failed (rc: {rc})", flush=True)

def on_disconnect(client, userdata, rc):
    print(f"[weight-web] Disconnected from MQTT broker (rc: {rc})", flush=True)

def on_publish(client, userdata, mid):
    print(f"[weight-web] Message {mid} successfully delivered to broker", flush=True)

client.on_connect = on_connect
client.on_disconnect = on_disconnect
client.on_publish = on_publish

def connect_mqtt():
    print(f"[weight-web] Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT}", flush=True)
    
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT)
            client.loop_start()
            return
        except Exception as e:
            print(f"[weight-web] Connection failed: {e}. Retrying in 5s...", flush=True)
            time.sleep(5)

def publish_weight_to_mqtt(weight):
    """Publish weight data to MQTT broker"""
    global message_count
    message_count += 1
    
    try:
        # Create JSON payload with device_id, weight, and unique message ID
        payload_data = {
            "device_id": DEVICE_ID,
            "weight": float(weight),
            "timestamp": datetime.now().isoformat(),
            "message_id": f"weight-manual-{message_count}-{int(time.time())}"
        }
        payload_json = json.dumps(payload_data)
        
        print(f"[weight-web] Manual input #{message_count}: Sending device {DEVICE_ID}, weight {weight}g, msg_id: {payload_data['message_id']}", flush=True)
        
        result = client.publish(MQTT_TOPIC, payload=payload_json, qos=1)
        
        if result.rc == 0:
            return {"success": True, "message": f"Weight {weight}g sent successfully", "message_id": payload_data['message_id']}
        else:
            return {"success": False, "message": f"Failed to send weight data (rc: {result.rc})"}
            
    except Exception as e:
        print(f"[weight-web] Error publishing weight: {e}", flush=True)
        return {"success": False, "message": f"Error: {str(e)}"}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/send_weight', methods=['POST'])
def send_weight():
    try:
        data = request.get_json()
        weight = data.get('weight')
        
        if weight is None:
            return jsonify({"success": False, "message": "Weight value is required"}), 400
        
        # Validate weight value
        try:
            weight = float(weight)
            if weight < 0:
                return jsonify({"success": False, "message": "Weight must be a positive number"}), 400
        except ValueError:
            return jsonify({"success": False, "message": "Weight must be a valid number"}), 400
        
        # Publish to MQTT
        result = publish_weight_to_mqtt(weight)
        
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        return jsonify({"success": False, "message": f"Server error: {str(e)}"}), 500

@app.route('/status')
def status():
    return jsonify({
        "service": "weight-web-interface",
        "mqtt_host": MQTT_HOST,
        "mqtt_topic": MQTT_TOPIC,
        "device_id": DEVICE_ID,
        "messages_sent": message_count
    })

if __name__ == '__main__':
    print("[weight-web] Smart Milk Weight Web Interface Starting...", flush=True)
    
    # Connect to MQTT in a separate thread
    mqtt_thread = threading.Thread(target=connect_mqtt)
    mqtt_thread.daemon = True
    mqtt_thread.start()
    
    # Give MQTT time to connect
    time.sleep(2)
    
    print("[weight-web] Starting Flask web server on port 5000...", flush=True)
    app.run(host='0.0.0.0', port=5000, debug=False)
