import paho.mqtt.client as mqtt
import os, time
import mysql.connector
from datetime import datetime

# Configuration
MQTT_HOST  = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT  = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "milk/weight")

MYSQL_CONFIG = {
    "host":     os.getenv("MYSQL_HOST", "mysql"),
    "user":     os.getenv("MYSQL_USER", "milkuser"),
    "password": os.getenv("MYSQL_PASSWORD", "Milk123!"),
    "database": os.getenv("MYSQL_DB", os.getenv("MYSQL_DATABASE", "users_db")),
}

DEVICE_ID       = os.getenv("DEVICE_ID", "device1")
ALERT_THRESHOLD = int(os.getenv("ALERT_THRESHOLD", "200"))

def send_alert(client_id, current_weight):
    print(f"ALERT: Client {client_id} milk is running low! Current weight: {current_weight}g")
    # In a real app, send email/push notification here

def on_message(client, userdata, msg, properties=None):
    weight = float(msg.payload.decode())

    if weight < ALERT_THRESHOLD:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        try:
            cursor = conn.cursor()
            # ← טבלת users (לא clients) ושימוש ב־DEVICE_ID מה־env
            cursor.execute("SELECT id FROM users WHERE device_id = %s", (DEVICE_ID,))
            row = cursor.fetchone()
        finally:
            try:
                cursor.close()
            except Exception:
                pass
            conn.close()

        if row:  # אם נמצא משתמש תואם
            client_id = row[0]
            send_alert(client_id, weight)
        else:
            # לא משנה את הפעולה העיקרית—רק הדפסה כדי להבין למה אין ALERT
            print(f"[updates] no matching user for device_id='{DEVICE_ID}', skipping alert")

def main():
    try:
        client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    except TypeError:
        client = mqtt.Client()

    client.on_message = on_message

    while True:
        try:
            print(f"[updates] connecting to MQTT at {MQTT_HOST}:{MQTT_PORT}, topic={MQTT_TOPIC}")
            client.connect(MQTT_HOST, MQTT_PORT)
            client.subscribe(MQTT_TOPIC)
            print("[updates] connected & subscribed")
            client.loop_forever()
        except Exception as e:
            print(f"[updates] Error: {e}; retrying in 5s…")
            time.sleep(5)

if __name__ == "__main__":
    main()
