import paho.mqtt.client as mqtt
import os, time, json
from datetime import datetime, timedelta
from email.message import EmailMessage
import mysql.connector
import smtplib
import ssl

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

# Update the configuration and tracking
ALERT_THRESHOLD_LOW = float(os.getenv("ALERT_THRESHOLD_LOW", "200"))    # First alert at 200g
ALERT_THRESHOLD_CRITICAL = float(os.getenv("ALERT_THRESHOLD_CRITICAL", "100"))  # Second alert at 100g

# Track which alerts have been sent for each device
_device_alerts_sent = {}  # {device_id: {"200": True, "100": True}}

# In-memory cooldown tracker per device
_device_cooldown_utc = {}  # {device_id: datetime}


# =========================
# Utility helpers
# =========================
def _now_utc():
    return datetime.utcnow()

def _cooldown_ok(device_id: str) -> bool:
    t = _device_cooldown_utc.get(device_id)
    return t is None or _now_utc() >= t

def _mark_sent(device_id: str):
    _device_cooldown_utc[device_id] = _now_utc() + timedelta(minutes=ALERT_COOLDOWN_MIN)

def reset_alerts_for_device(device_id: str):
    """Reset alert tracking when milk is refilled (weight goes back up)"""
    if device_id in _device_alerts_sent:
        del _device_alerts_sent[device_id]
    print(f"[updates] 🔄 Alert tracking reset for device {device_id} (milk refilled)")

def should_send_alert(device_id: str, weight: float) -> tuple[bool, str]:
    """
    Returns (should_send, alert_type)
    alert_type: "200" or "100" or None
    """
    if device_id not in _device_alerts_sent:
        _device_alerts_sent[device_id] = {}
    
    device_alerts = _device_alerts_sent[device_id]
    
    # Check for critical alert (100g)
    if weight < ALERT_THRESHOLD_CRITICAL:
        if not device_alerts.get("100"):
            return True, "100"
    
    # Check for low alert (200g)  
    elif weight < ALERT_THRESHOLD_LOW:
        if not device_alerts.get("200"):
            return True, "200"
    
    # Weight is above 200g - reset alerts for refill detection
    elif weight >= ALERT_THRESHOLD_LOW:
        if device_alerts:  # Only reset if we had sent alerts
            reset_alerts_for_device(device_id)
    
    return False, None

def mark_alert_sent(device_id: str, alert_type: str):
    """Mark that we've sent this type of alert for this device"""
    if device_id not in _device_alerts_sent:
        _device_alerts_sent[device_id] = {}
    _device_alerts_sent[device_id][alert_type] = True
    print(f"[updates] 📝 Marked {alert_type}g alert as sent for device {device_id}")

# =========================
# DB access
# =========================
def find_all_users_by_device(device_id: str):
    """Return list of dicts [{id, full_name, email}, ...] for ALL users with this device_id."""
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cur  = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id, full_name, email FROM users WHERE device_id=%s",
            (device_id,)
        )
        rows = cur.fetchall()
        return rows
    except Exception as e:
        print(f"[updates] MySQL error while finding users: {e}")
        return []
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
from typing import Optional

def send_email_alert(to_email: str, full_name: str, weight_g: float, alert_type: str):
    """Send email alert with appropriate message based on alert type"""
    if alert_type == "100":
        subject = "🚨 Smart Milk: CRITICAL - Milk Almost Empty!"
        body = (
            f"Hi {full_name or 'there'},\n\n"
            f"🚨 CRITICAL ALERT: Your milk is almost empty!\n"
            f"Current weight: {weight_g:.0f}g\n\n"
            f"Please buy milk immediately - you're running very low!\n\n"
            f"— Smart Milk System"
        )
    else:  # alert_type == "200"
        subject = "⚠️ Smart Milk: Low Milk Alert"
        body = (
            f"Hi {full_name or 'there'},\n\n"
            f"⚠️ Your milk level is getting low.\n"
            f"Current weight: {weight_g:.0f}g\n\n"
            f"Consider buying a new carton soon.\n\n"
            f"— Smart Milk System"
        )

    
    # Send actual email (existing email sending code)
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL or SMTP_USER
    msg["To"] = to_email
    msg.set_content(body)

    try:
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
        
        print(f"[updates] ✅ {alert_type}g alert email sent to {to_email}")
    except Exception as e:
        print(f"[updates] ❌ Failed to send email: {e}")


def print_alert(user_id: int, weight: float):
    print(f"[updates] ALERT: user_id={user_id} milk low; current={weight}g (< {ALERT_THRESHOLD})")


# =========================
# MQTT callbacks
# =========================
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        client.subscribe(MQTT_TOPIC)
        print("[updates] ✅ Connected to MQTT broker and subscribing to topic: {MQTT_TOPIC} successfully!")
    else:
        print(f"[updates] ❌ MQTT connection failed with code: {rc}")

def on_message(client, userdata, msg):
    try:
        device_id, weight = parse_payload(msg.payload)
        print(f"[updates] ⚖️  Received weight: {weight}g from device: {device_id}")
        
        # Check if we should send an alert for this device
        should_send, alert_type = should_send_alert(device_id, weight)
        
        if not should_send:
            if weight >= ALERT_THRESHOLD_LOW:
                print(f"[updates] ✅ Weight {weight}g >= {ALERT_THRESHOLD_LOW}g; no alerts needed")
            else:
                print(f"[updates] ⏭️  No new alerts needed for device {device_id} at weight {weight}g")
            return

        # Only query database if we actually need to send alerts
        print(f"[updates] 🚨 LOW MILK ALERT! Weight {weight}g < threshold {ALERT_THRESHOLD_LOW}g")
        
        users = find_all_users_by_device(device_id)
        if not users:
            print(f"[updates] ❌ No users found for device_id='{device_id}', skipping alert")
            return

        print(f"[updates]  Found {len(users)} user(s) connected to device {device_id}")

        # Send alerts to all users connected to this device
        for user in users:
            user_email = user.get("email")
            full_name = user.get("full_name")
            
            print(f"[updates] 👤 Sending alert to: {full_name} ({user_email})")
            print(f"[updates] 🚨 Sending {alert_type}g threshold alert to {user_email} for weight: {weight}g")
            send_email_alert(user_email, full_name, weight, alert_type)
        
        # Mark alert as sent for this device
        mark_alert_sent(device_id, alert_type)

    except Exception as e:
        print(f"[updates] ❌ Error processing MQTT message: {e}")


# =========================
# Main
# =========================
def main():
    print("[updates] 🚀 Smart Milk Updates Service Starting...")
    print(f"[updates] 📡 MQTT Config: {MQTT_HOST}:{MQTT_PORT}, Topic: {MQTT_TOPIC}")
    print(f"[updates] 🚨 Alert Thresholds: {ALERT_THRESHOLD_LOW}g (Low), {ALERT_THRESHOLD_CRITICAL}g (Critical)")
    print(f"[updates] 📧 Email Config: {SMTP_HOST}:{SMTP_PORT}")
    print(f"[updates] ⏰ Alert Cooldown: {ALERT_COOLDOWN_MIN} minutes")
    
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