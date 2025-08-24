import paho.mqtt.client as mqtt
import time
import mysql.connector
from datetime import datetime

# Configuration
MQTT_HOST = "mqtt"
MQTT_TOPIC = "milk/weight"
ALERT_THRESHOLD = 200  # grams
MYSQL_CONFIG = {
    "host": "mysql",
    "user": "milkuser",
    "password": "milkpass",
    "database": "milkdb"
}

def send_alert(client_id, current_weight):
    print(f"ALERT: Client {client_id} milk is running low! Current weight: {current_weight}g")
    # In a real app, send email/push notification here

def on_message(client, userdata, msg):
    weight = float(msg.payload.decode())
    
    if weight < ALERT_THRESHOLD:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM clients WHERE device_id = %s", ("device1",))
        client_id = cursor.fetchone()[0]
        conn.close()
        
        send_alert(client_id, weight)

def main():
    client = mqtt.Client()
    client.on_message = on_message
    
    while True:
        try:
            print(f"[updates-service] connecting to MQTT at {MQTT_HOST}:{MQTT_PORT}, topic={MQTT_TOPIC}")
            client.connect(MQTT_HOST, 1883)
            client.subscribe(MQTT_TOPIC)
            print("Updates service connected to MQTT")
            client.loop_forever()
        except Exception as e:
            print(f"Error: {e}, retrying...")
            time.sleep(5)

if __name__ == "__main__":
    main()