import paho.mqtt.client as mqtt
import os, time, json
from datetime import datetime
from email.message import EmailMessage
import mysql.connector

# =========================
# Config (env with defaults)
# =========================
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
ALERT_THRESHOLD   = float(os.getenv("ALERT_THRESHOLD", "200"))  # grams

# Email / SMTP
SMTP_HOST   = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT   = int(os.getenv("SMTP_PORT", "587"))  # 587 STARTTLS, 465 SSL
SMTP_USER   = os.getenv("SMTP_USER")             # e.g., gmail address
SMTP_PASS   = os.getenv("SMTP_PASS")             # app password / smtp key
FROM_EMAIL  = os.getenv("FROM_EMAIL", SMTP_USER) # sender identity
DRY_RUN     = os.getenv("DRY_RUN_EMAIL", "false").lower() == "true"

# Throttle (avoid spamming): minutes between emails per user
ALERT_COOLDOWN_MIN = int(os.getenv("ALERT_COOLDOWN_MIN", "60"))

# In-memory cooldown tracker
_next_allowed_send_utc = {}  # {user_id: datetime}


# =========================
# Utility helpers
# =========================
def _now_utc():
    return datetime.utcnow()

def _cooldown_ok(user_id: int) -> bool:
    t = _next_allowed_send_utc.get(user_id)
    return t is None or _now_utc() >= t

def _mark_sent(user_id: int):
    _next_allowed_send_utc[user_id] = _now_utc() + timedelta(minutes=ALERT_COOLDOWN_MIN)


# =========================
# DB access
# =========================
def find_user_by_device(device_id: str):
    """Return dict {id, full_name, email} for users.device_id, or None."""
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cur  = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id, full_name, email FROM users WHERE device_id=%s LIMIT 1",
            (device_id,)
        )
        row = cur.fetchone()
        return row
    except Exception as e:
        print(f"[updates] MySQL error while finding user: {e}")
        return None
    finally:
        try:
            cur.close(); conn.close()
        except Exception:
            pass


# =========================
# MQTT payload parsing
# =========================
def parse_payload(msg_bytes: bytes):
    """
    Supports:
      JSON   -> {"device_id":"device1","weight":950,"ts":"..."}
      Number -> "950"  (falls back to DEFAULT_DEVICE_ID)
    Returns (device_id, weight)
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
    # Plain numeric
    weight = float(text)  # raises ValueError if not numeric
    return DEFAULT_DEVICE_ID, weight


# =========================
# Email sending
# =========================
def send_email_alert(to_email: str, full_name: str | None, weight_g: float):
    subject = "Smart Milk: Low Milk Alert"
    body = (
        f"Hi {full_name or 'there'},\n\n"
        f"Your milk level is low — current weight: {weight_g:.0f} g.\n"
        f"Consider buying a new carton soon :)\n\n"
        f"— Smart Milk"
    )

    print(f"[updates] Preparing email to {to_email!r} (DRY_RUN={DRY_RUN})")
    if DRY_RUN or not (SMTP_USER and SMTP_PASS and to_email):
        print(f"[updates] DRY RUN / missing SMTP creds → would send:\nSubject: {subject}\n{body}")
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL or SMTP_USER
    msg["To"] = to_email
    msg.set_content(body)

    if SMTP_PORT == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)

    print(f"[updates] Email sent to {to_email}")


def print_alert(user_id: int, weight: float):
    print(f"[updates] ALERT: user_id={user_id} milk low; current={weight}g (< {ALERT_THRESHOLD})")


# =========================
# MQTT callbacks
# =========================
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[updates] connected to MQTT {MQTT_HOST}:{MQTT_PORT} (rc={rc}); subscribing to {MQTT_TOPIC}")
        client.subscribe(MQTT_TOPIC, qos=1)
    else:
        print(f"[updates] connect failed rc={rc}")

def on_message(client, userdata, msg):
    try:
        device_id, weight = parse_payload(msg.payload)
        if weight >= ALERT_THRESHOLD:
            print(f"[updates] weight {weight}g >= threshold {ALERT_THRESHOLD}g; no alert")
            return

        user = find_user_by_device(device_id)
        if not user:
            print(f"[updates] no user found for device_id='{device_id}', skipping alert")
            return

        user_id    = user["id"]
        full_name  = user.get("full_name")
        user_email = user.get("email")

        if not user_email:
            print(f"[updates] user_id={user_id} has no email; printing alert only")
            print_alert(user_id, weight)
            return

        if not _cooldown_ok(user_id):
            print(f"[updates] cooldown active for user_id={user_id}; skipping email")
            return

        # Print + Email + cooldown
        print_alert(user_id, weight)
        send_email_alert(user_email, full_name, weight)
        _mark_sent(user_id)

        # Optional: also publish alert to an MQTT topic for UI listeners
        try:
            payload = {
                "user_id": user_id,
                "email": user_email,
                "weight": weight,
                "ts": datetime.utcnow().isoformat() + "Z"
            }
            client.publish("milk/alerts", json.dumps(payload), qos=1, retain=False)
        except Exception as e:
            print(f"[updates] failed to publish alert json: {e}")

    except Exception as e:
        print(f"[updates] message handling error: {e}")


# =========================
# Main
# =========================
def main():
    try:
        client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    except TypeError:
        client = mqtt.Client()  # older paho versions

    client.on_connect = on_connect
    client.on_message = on_message

    while True:
        try:
            print(f"[updates] connecting to MQTT at {MQTT_HOST}:{MQTT_PORT}, topic={MQTT_TOPIC}")
            client.connect(MQTT_HOST, MQTT_PORT)
            client.loop_forever(retry_first_connection=True)
        except Exception as e:
            print(f"[updates] MQTT error: {e}; retrying in 5s…")
            time.sleep(5)


if __name__ == "__main__":
    main()