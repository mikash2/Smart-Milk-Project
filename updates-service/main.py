import paho.mqtt.client as mqtt
import os, time, json
from datetime import datetime
import mysql.connector

# ===== Config =====
MQTT_HOST  = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT  = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "milk/weight")

MYSQL_CONFIG = {
    "host":     os.getenv("MYSQL_HOST", "mysql"),
    "user":     os.getenv("MYSQL_USER", "milkuser"),
    "password": os.getenv("MYSQL_PASSWORD", "Milk123!"),
    "database": os.getenv("MYSQL_DB", os.getenv("MYSQL_DATABASE", "users_db")),
    "charset": "utf8mb4",
    "use_pure": True,
}

DEFAULT_DEVICE_ID = os.getenv("DEVICE_ID", "device1")
ALERT_THRESHOLD   = int(os.getenv("ALERT_THRESHOLD", "200"))  # grams

def send_alert(user_id: int, current_weight: float):
    # In real life you'd publish to an alerts topic, send email, push, etc.
    print(f"[updates] ALERT: user_id={user_id} milk low; current={current_weight}g (< {ALERT_THRESHOLD})")

def find_user_id_by_device(device_id: str):
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cur  = conn.cursor()
        cur.execute("SELECT id FROM users WHERE device_id = %s LIMIT 1", (device_id,))
        row = cur.fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f"[updates] MySQL error while finding user: {e}")
        return None
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

def parse_payload(msg_bytes: bytes):
    """
    Returns (device_id, weight). Supports:
    - JSON: {"device_id":"device1","weight":950,...}
    - Plain number: "950"  (uses DEFAULT_DEVICE_ID)
    """
    text = msg_bytes.decode(errors="ignore").strip()
    # Try JSON first
    try:
        data = json.loads(text)
        weight = float(data.get("weight"))
        device_id = data.get("device_id") or DEFAULT_DEVICE_ID
        return device_id, weight
    except Exception:
        pass
    # Try plain numeric fallback
    try:
        weight = float(text)
        return DEFAULT_DEVICE_ID, weight
    except Exception:
        raise ValueError(f"Unsupported payload format: {text!r}")

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[updates] connected to MQTT {MQTT_HOST}:{MQTT_PORT} (rc={rc}); subscribing to {MQTT_TOPIC}")
        client.subscribe(MQTT_TOPIC, qos=1)
    else:
        print(f"[updates] connect failed rc={rc}")

def on_message(client, userdata, msg):
    try:
        device_id, weight = parse_payload(msg.payload)
        # Only alert when below threshold
        if weight < ALERT_THRESHOLD:
            user_id = find_user_id_by_device(device_id)
            if user_id is not None:
                send_alert(user_id, weight)
                client.publish(
                    "milk/alerts",
                    json.dumps({
                        "user_id": user_id,
                        "weight": weight,
                        "ts": datetime.utcnow().isoformat() + "Z"
                    }),
                    qos=1,
                    retain=False
                )
            else:
                print(f"[updates] no user found for device_id='{device_id}', skipping alert")
        else:
            print(f"[updates] weight {weight}g >= threshold {ALERT_THRESHOLD}g; no alert")
    except Exception as e:
        print(f"[updates] message handling error: {e}")

def main():
    # Try to use v2 callback API if available
    try:
        client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    except TypeError:
        client = mqtt.Client()

    client.on_connect = on_connect
    client.on_message = on_message

    # Robust reconnect loop
    while True:
        try:
            print(f"[updates] connecting to MQTT at {MQTT_HOST}:{MQTT_PORT}")
            client.connect(MQTT_HOST, MQTT_PORT)
            client.loop_forever(retry_first_connection=True)
        except Exception as e:
            print(f"[updates] MQTT error: {e}; retrying in 5s…")
            time.sleep(5)

if __name__ == "__main__":
    main()
