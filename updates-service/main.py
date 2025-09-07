import paho.mqtt.client as mqtt
import os, time, json
from datetime import datetime, timedelta
from email.message import EmailMessage
import mysql.connector
import smtplib
import ssl
import threading

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

# Carton removal detection configuration
CARTON_REMOVAL_GRACE_PERIOD_MIN = int(os.getenv("CARTON_REMOVAL_GRACE_PERIOD_MIN", "1"))  # Wait 1 minute before alerting on 0g

# Track which alerts have been sent for each device
_device_alerts_sent = {}  # {device_id: {"200": True, "100": True}}

# In-memory cooldown tracker per device
_device_cooldown_utc = {}  # {device_id: datetime}

# Carton removal tracking per device - tracks previous weight before 0g
_device_carton_removal_tracking = {}  # {device_id: {"previous_weight": float, "zero_time": datetime, "grace_period_active": bool}}

# Add this new tracking dictionary
_device_zero_weight_tracking = {}  # {device_id: {"zero_start_time": datetime}}

# User-based alert tracking per user - NEW: Track alerts per user instead of per device
_user_alerts_sent = {}  # {user_id: {"200": True, "100": True}}

# Add this global variable at the top with other tracking variables
_last_weight_by_device = {}  # device_id -> weight


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
    
    # Also reset carton removal tracking when weight goes back up significantly
    if device_id in _device_carton_removal_tracking:
        del _device_carton_removal_tracking[device_id]
    
    print(f"[updates] 🔄 Alert tracking reset for device {device_id} (milk refilled)")

def reset_user_alerts_for_device(device_id: str):
    """Reset user alert tracking when milk is refilled (weight goes back up)"""
    users = find_all_users_by_device(device_id)
    for user in users:
        user_id = user.get("id")
        if user_id in _user_alerts_sent:
            del _user_alerts_sent[user_id]
            print(f"[updates] 🔄 User alert tracking reset for user {user_id} (milk refilled)")

def should_send_user_alert(user_id: int, user_threshold: int, weight: float) -> tuple[bool, str]:
    """
    Check if we should send an alert to a specific user based on their threshold.
    Returns (should_send_alert, alert_type)
    """
    # If weight is 0g, don't send immediate alert - wait for 1-minute timer
    if weight == 0:
        return False, "none"
    
    # Always send critical alert at 100g regardless of user threshold
    if weight <= ALERT_THRESHOLD_CRITICAL:
        # Check if we already sent critical alert to this user
        if user_id not in _user_alerts_sent:
            _user_alerts_sent[user_id] = {}
        
        if not _user_alerts_sent[user_id].get("100"):
            return True, "100"
        else:
            return False, "none"  # Already sent critical alert
    
    # If user has no threshold set, use default 200g
    if user_threshold is None:
        user_threshold = ALERT_THRESHOLD_LOW
    
    # Check if weight is below user's threshold
    if weight <= user_threshold:
        # Check if we already sent threshold alert to this user
        if user_id not in _user_alerts_sent:
            _user_alerts_sent[user_id] = {}
        
        if not _user_alerts_sent[user_id].get("200"):
            return True, "200"
        else:
            return False, "none"  # Already sent threshold alert
    
    return False, "none"

def mark_user_alert_sent(user_id: int, alert_type: str):
    """Mark that we've sent this type of alert to this user"""
    if user_id not in _user_alerts_sent:
        _user_alerts_sent[user_id] = {}
    _user_alerts_sent[user_id][alert_type] = True
    print(f"[updates] 📝 Marked {alert_type}g alert as sent for user {user_id}")

def handle_carton_removal_logic(device_id: str, weight: float) -> tuple[bool, str]:
    """
    Handle the sophisticated carton removal logic based on previous weight.
    Returns (should_send_alert, alert_type)
    """
    now = _now_utc()
    
    # If weight is not 0g, update previous weight and reset tracking if needed
    if weight > 0:
        # If we were in grace period and weight came back up, check what to do
        if device_id in _device_carton_removal_tracking:
            tracking = _device_carton_removal_tracking[device_id]
            previous_weight = tracking.get("previous_weight", 0)
            
            if tracking.get("grace_period_active", False):
                # Grace period was active, now we have a new weight
                print(f"[updates] 🥛 Carton returned after removal! Previous: {previous_weight}g, Current: {weight}g")
                
                # Determine action based on previous weight and current weight
                if previous_weight >= ALERT_THRESHOLD_LOW:  # Was above 200g before removal
                    if weight >= ALERT_THRESHOLD_LOW:  # Back above 200g
                        print(f"[updates] ✅ Carton refilled to {weight}g - no alert needed (was {previous_weight}g before)")
                        del _device_carton_removal_tracking[device_id]
                        return False, None
                    elif weight >= ALERT_THRESHOLD_CRITICAL:  # Between 100-200g
                        print(f"[updates] ⚠️ Carton returned at {weight}g (was {previous_weight}g) - sending warning alert")
                        del _device_carton_removal_tracking[device_id]
                        return True, "200"
                    else:  # Below 100g
                        print(f"[updates] 🚨 Carton returned at {weight}g (was {previous_weight}g) - sending critical alert")
                        del _device_carton_removal_tracking[device_id]
                        return True, "100"
                
                else:  # Was below 200g before removal
                    if weight >= ALERT_THRESHOLD_CRITICAL:  # Between 100-200g
                        # Check if we already sent warning alert for this range
                        if not _device_alerts_sent.get(device_id, {}).get("200"):
                            print(f"[updates] ⚠️ Carton returned at {weight}g (was {previous_weight}g) - sending warning alert")
                            del _device_carton_removal_tracking[device_id]
                            return True, "200"
                        else:
                            print(f"[updates] ⏭️ Carton returned at {weight}g (was {previous_weight}g) - warning already sent")
                            del _device_carton_removal_tracking[device_id]
                            return False, None
                    else:  # Below 100g
                        print(f"[updates] 🚨 Carton returned at {weight}g (was {previous_weight}g) - sending critical alert")
                        del _device_carton_removal_tracking[device_id]
                        return True, "100"
            
            else:
                # Not in grace period, just update previous weight
                tracking["previous_weight"] = weight
        else:
            # No tracking exists, create it
            _device_carton_removal_tracking[device_id] = {
                "previous_weight": weight,
                "zero_time": None,
                "grace_period_active": False
            }
        
        return False, None  # Normal weight processing
    
    # Weight is 0g - handle carton removal
    if device_id not in _device_carton_removal_tracking:
        # First time seeing 0g, start tracking
        _device_carton_removal_tracking[device_id] = {
            "previous_weight": 0,  # Will be updated from previous readings
            "zero_time": now,
            "grace_period_active": True
        }
        print(f"[updates] 🥛 Carton removal detected for device {device_id} - starting 1 minute grace period")
        return False, None
    
    tracking = _device_carton_removal_tracking[device_id]
    
    if tracking.get("grace_period_active", False):
        # Check if grace period expired
        grace_period_expired = now >= tracking["zero_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN)
        
        if grace_period_expired:
            print(f"[updates] ⏰ Grace period expired for device {device_id} - carton appears to be empty, sending critical alert")
            del _device_carton_removal_tracking[device_id]
            return True, "100"  # Critical alert for empty carton
        else:
            remaining_time = (tracking["zero_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN) - now).total_seconds()
            print(f"[updates] ⏳ Carton removal grace period active for device {device_id}, {remaining_time:.0f} seconds remaining")
            return False, None
    
    return False, None

def check_expired_grace_periods():
    """Check if any grace periods have expired and send 'milk is over' alerts"""
    now = _now_utc()
    expired_devices = []
    
    for device_id, tracking in _device_zero_weight_tracking.items():
        grace_period_expired = now >= tracking["zero_start_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN)
        
        if grace_period_expired:
            expired_devices.append(device_id)
            print(f"[updates] ⏰ Grace period expired for device {device_id} - milk is over, sending 'milk is over' alert")
    
    # Send "milk is over" alerts for expired devices
    for device_id in expired_devices:
        del _device_zero_weight_tracking[device_id]
        
        # Send "milk is over" alert
        users = find_all_users_by_device(device_id)
        if not users:
            print(f"[updates] ❌ No users found for device_id='{device_id}', skipping alert")
            continue

        print(f"[updates]  MILK IS OVER ALERT! Sending 'milk is over' email")
        print(f"[updates]  Found {len(users)} user(s) connected to device {device_id}")

        # Send "milk is over" alerts to all users connected to this device
        for user in users:
            user_email = user.get("email")
            full_name = user.get("full_name")
            
            print(f"[updates] 👤 Sending 'milk is over' alert to: {full_name} ({user_email})")
            send_milk_is_over_email(user_email, full_name)

def send_milk_is_over_email(to_email: str, full_name: str):
    """Send 'milk is over' email alert"""
    subject = "🥛 Smart Milk: Milk Carton is Empty!"
    body = (
        f"Hi {full_name or 'there'},\n\n"
        f"🥛 Your milk carton appears to be empty!\n\n"
        f"The weight sensor detected that your milk carton has been removed for more than 1 minute.\n"
        f"This usually means the milk is finished and you need to buy a new carton.\n\n"
        f"Please check your milk and consider buying a new carton.\n\n"
        f"— Smart Milk System"
    )

    # Send actual email
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
        
        print(f"[updates] ✅ 'Milk is over' email sent to {to_email}")
    except Exception as e:
        print(f"[updates] ❌ Failed to send 'milk is over' email: {e}")

def handle_zero_weight_simple_logic(device_id: str, weight: float) -> tuple[bool, str]:
    """
    Simple rule: If weight is 0g for more than 1 minute, send critical alert - regardless of previous weight.
    Returns (should_send_alert, alert_type)
    """
    now = _now_utc()
    
    # If weight is not 0g, reset zero weight tracking (cancel the timer)
    if weight > 0:
        if device_id in _device_zero_weight_tracking:
            del _device_zero_weight_tracking[device_id]
            print(f"[updates] ✅ Weight returned to {weight}g - canceling 'milk is over' timer")
        return False, None
    
    # Weight is 0g
    if device_id not in _device_zero_weight_tracking:
        # First time seeing 0g, start tracking
        _device_zero_weight_tracking[device_id] = {
            "zero_start_time": now
        }
        print(f"[updates] 🥛 Zero weight detected for device {device_id} - starting 1 minute 'milk is over' timer")
        return False, None
    
    # Check if grace period expired
    tracking = _device_zero_weight_tracking[device_id]
    grace_period_expired = now >= tracking["zero_start_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN)
    
    if grace_period_expired:
        print(f"[updates] ⏰ Grace period expired for device {device_id} - milk is over, sending 'milk is over' alert")
        del _device_zero_weight_tracking[device_id]
        return True, "milk_is_over"  # Special alert type for "milk is over"
    else:
        remaining_time = (tracking["zero_start_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN) - now).total_seconds()
        print(f"[updates] ⏳ 'Milk is over' timer active for device {device_id}, {remaining_time:.0f} seconds remaining")
        return False, None

def should_send_alert(device_id: str, weight: float) -> tuple[bool, str]:
    """
    Returns (should_send, alert_type)
    alert_type: "200" or "100" or "milk_is_over" or None
    """
    # First check simple zero weight logic
    should_send, alert_type = handle_zero_weight_simple_logic(device_id, weight)
    if should_send:
        return should_send, alert_type
    
    # If weight is 0g and simple logic didn't send alert, don't check other logic
    if weight == 0:
        return False, None
    
    # Then check carton removal logic for non-zero weights
    should_send, alert_type = handle_carton_removal_logic(device_id, weight)
    if should_send:
        return should_send, alert_type
    
    # Normal alert logic for non-zero weights
    if weight > 0:
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
                reset_user_alerts_for_device(device_id)  # Also reset user alerts
    
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
    """Return list of dicts [{id, full_name, email, threshold_wanted}, ...] for ALL users with this device_id."""
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cur  = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id, full_name, email, threshold_wanted FROM users WHERE device_id=%s",
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
        
        # Get all users connected to this device
        users = find_all_users_by_device(device_id)
        if not users:
            print(f"[updates] ❌ No users found for device_id='{device_id}', skipping alert")
            return

        print(f"[updates]  Found {len(users)} user(s) connected to device {device_id}")

        # Check if this is a refill (weight going up significantly)
        previous_weight = _last_weight_by_device.get(device_id, 0)
        is_refill = weight > previous_weight and weight >= ALERT_THRESHOLD_LOW
        
        if is_refill:
            print(f"[updates] 🔄 Milk refilled: {previous_weight}g → {weight}g, resetting user alerts")
            reset_user_alerts_for_device(device_id)
        
        # Update last weight
        _last_weight_by_device[device_id] = weight

        # Check each user's threshold and send appropriate alerts
        for user in users:
            user_id = user.get("id")
            user_threshold = user.get("threshold_wanted")
            user_email = user.get("email")
            user_name = user.get("full_name")
            
            # Check if we should send an alert to this specific user
            should_alert, alert_type = should_send_user_alert(user_id, user_threshold, weight)
            
            if should_alert:
                print(f"[updates] 👤 Sending {alert_type}g alert to user {user_name} ({user_email}) for weight: {weight}g")
                send_email_alert(user_email, user_name, weight, alert_type)
                mark_user_alert_sent(user_id, alert_type)  # Mark as sent to prevent duplicates
            else:
                if weight > 0:
                    # Use the user's actual threshold for the comparison
                    actual_threshold = user_threshold if user_threshold is not None else ALERT_THRESHOLD_LOW
                    if weight >= actual_threshold:
                        print(f"[updates] ✅ Weight {weight}g >= {actual_threshold}g (user threshold); no alerts needed for {user_name}")
                    else:
                        print(f"[updates] ⏭️  No new alerts needed for user {user_name} at weight {weight}g (threshold: {actual_threshold}g)")
                else:
                    print(f"[updates] ⏳ Weight {weight}g - 'milk is over' timer active")

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
    print(f"[updates] 🥛 Carton Removal Detection: {CARTON_REMOVAL_GRACE_PERIOD_MIN} minute grace period for 0g readings")
    
    try:
        client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    except TypeError:
        client = mqtt.Client()  # older paho versions

    client.on_connect = on_connect
    client.on_message = on_message

    # Start a background thread to check expired grace periods
    def grace_period_checker():
        while True:
            time.sleep(10)  # Check every 10 seconds
            check_expired_grace_periods()
    
    grace_thread = threading.Thread(target=grace_period_checker, daemon=True)
    grace_thread.start()
    print("[updates] 🔄 Started grace period checker thread")

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