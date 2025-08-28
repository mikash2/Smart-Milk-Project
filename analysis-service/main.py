# analysis-service/main.py
import os
import time
from datetime import datetime

import mysql.connector  # type: ignore
import paho.mqtt.client as mqtt  # type: ignore

# ======= ENV (תואם ל-compose) =======
MQTT_HOST   = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT   = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC  = os.getenv("MQTT_TOPIC", "milk/weight")

MYSQL_CONFIG = {
    "host":     os.getenv("MYSQL_HOST", "mysql"),
    "user":     os.getenv("MYSQL_USER", "milkuser"),
    "password": os.getenv("MYSQL_PASSWORD", "Milk123!"),
    # שימי לב: אצלך DB נקרא users_db
    "database": os.getenv("MYSQL_DB", os.getenv("MYSQL_DATABASE", "users_db")),
}

# ה־schema שלך קושר ע"י device_id → users(device_id)
DEVICE_ID = os.getenv("DEVICE_ID", "device1")

def get_user_id_by_device(conn, device_id: str):
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE device_id = %s", (device_id,))
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None

def save_weight(weight: float):
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    try:
        cur = conn.cursor()

        # ודאי שיש משתמש עם אותו device_id (FK ב-weight_data)
        user_id = get_user_id_by_device(conn, DEVICE_ID)
        if user_id is None:
            print(f"[analysis] No user with device_id='{DEVICE_ID}' – skipping insert.")
            conn.close()
            return

        # 1) שמירת מדידה גולמית לטבלת weight_data (עמודות לפי הסכימה שלך)
        now = datetime.now()
        cur.execute(
            "INSERT INTO weight_data (device_id, weight, timestamp) VALUES (%s, %s, %s)",
            (DEVICE_ID, float(weight), now)
        )

        # 2) עדכון user_stats (sample_count/avg/min/last_updated)
        cur.execute("SELECT sample_count, avg_weight, min_weight FROM user_stats WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        if row:
            sample_count, avg_weight, min_weight = row
            sample_count = int(sample_count or 0)
            avg_weight   = float(avg_weight or 0.0)
            min_weight   = float(min_weight) if min_weight is not None else float(weight)

            new_count = sample_count + 1
            new_avg   = (avg_weight * sample_count + float(weight)) / new_count
            new_min   = min(min_weight, float(weight))

            cur.execute(
                "UPDATE user_stats SET sample_count=%s, avg_weight=%s, min_weight=%s, last_updated=%s WHERE user_id=%s",
                (new_count, new_avg, new_min, now, user_id)
            )
        else:
            cur.execute(
                "INSERT INTO user_stats (user_id, sample_count, avg_weight, min_weight, last_updated) VALUES (%s, %s, %s, %s, %s)",
                (user_id, 1, float(weight), float(weight), now)
            )

        conn.commit()
        cur.close()
        print("[analysis] Saved to MySQL ✅")
    except Exception as e:
        print(f"[analysis] Error saving to MySQL: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass

# ======= MQTT callbacks =======
def on_connect(client, userdata, flags, rc, properties=None):
    client.subscribe(MQTT_TOPIC)
    print(f"[analysis] Connected to MQTT and subscribed to {MQTT_TOPIC}")

def on_message(client, userdata, msg, properties=None):
    try:
        payload = msg.payload.decode().strip()
        weight = float(payload)
        print(f"[analysis] Received weight: {weight}g")
        save_weight(weight)
    except Exception as e:
        print(f"[analysis] Error parsing/handling message: {e}")

def main():
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT)
            client.loop_forever()
        except Exception as e:
            print(f"[analysis] Error: {e}; retrying in 5s…")
            time.sleep(5)

if __name__ == "__main__":
    main()
