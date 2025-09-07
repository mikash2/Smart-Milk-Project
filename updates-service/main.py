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

# User-based alert tracking per user - NEW: Track alerts per user instead of per device
_user_alerts_sent = {}  # {user_id: {"200": True, "100": True}}

# Add this global variable at the top with other tracking variables
_last_weight_by_device = {}  # device_id -> weight

# Add this configuration at the top with other constants
REFILL_THRESHOLD_G = float(os.getenv("REFILL_THRESHOLD_G", "1000"))  # Only consider refill above 1000g


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
        
        if not _user_alerts_sent[user_id].get("critical"):
            return True, "critical"
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
        
        # Use "warning" as the alert type for all threshold alerts
        if not _user_alerts_sent[user_id].get("warning"):
            return True, "warning"
        else:
            return False, "none"  # Already sent warning alert
    
    return False, "none"

def mark_user_alert_sent(user_id: int, alert_type: str):
    """Mark that we've sent this type of alert to this user"""
    if user_id not in _user_alerts_sent:
        _user_alerts_sent[user_id] = {}
    _user_alerts_sent[user_id][alert_type] = True
    print(f"[updates] 📝 Marked {alert_type}g alert as sent for user {user_id}")

def handle_carton_removal_logic(device_id: str, weight: float) -> tuple[bool, str]:
    """
    Handle carton removal detection logic.
    Returns (should_send_alert, alert_type)
    """
    now = _now_utc()
    
    # If weight is not 0g, handle carton return
    if weight > 0:
        if device_id in _device_carton_removal_tracking:
            tracking = _device_carton_removal_tracking[device_id]
            previous_weight = tracking.get("previous_weight", 0)
            
            # If we were in a grace period, carton was returned
            if tracking.get("grace_period_active", False):
                print(f"[updates] 🥛 Carton returned at {weight}g (was {previous_weight}g) - clearing grace period")
                # Clear the grace period and update tracking
                tracking["grace_period_active"] = False
                tracking["zero_time"] = None
                tracking["previous_weight"] = weight
                return False, None  # No alert needed, carton was just temporarily removed
            
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
    
    # If grace period is not active, start it
    if not tracking.get("grace_period_active", False):
        tracking["zero_time"] = now
        tracking["grace_period_active"] = True
        print(f"[updates] 🥛 Carton removal detected for device {device_id} - starting 1 minute grace period")
        return False, None
    
    # Grace period is active, check if expired
    grace_period_expired = now >= tracking["zero_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN)
    
    if grace_period_expired:
        print(f"[updates] ⏰ Grace period expired for device {device_id} - carton appears to be empty, sending critical alert")
        del _device_carton_removal_tracking[device_id]
        return True, "critical"  # Critical alert for empty carton
    else:
        remaining_time = (tracking["zero_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN) - now).total_seconds()
        print(f"[updates] ⏳ Carton removal grace period active for device {device_id}, {remaining_time:.0f} seconds remaining")
        return False, None

def check_expired_grace_periods():
    """Check if any grace periods have expired and send 'milk is over' alerts"""
    now = _now_utc()
    expired_devices = []
    
    #print(f"[updates] 🔍 Background thread: Checking grace periods at {now} - tracking {len(_device_carton_removal_tracking)} devices")
    
    # Check the correct tracking dictionary
    for device_id, tracking in _device_carton_removal_tracking.items():
        #print(f"[updates] 🔍 Background thread: Found device {device_id} with tracking: {tracking}")
        
        if tracking.get("grace_period_active", False):
            grace_period_expired = now >= tracking["zero_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN)
            
            #print(f"[updates] 🔍 Background thread: Device {device_id}: grace_period_active={tracking.get('grace_period_active')}, zero_time={tracking['zero_time']}, expired={grace_period_expired}")
            
            if grace_period_expired:
                expired_devices.append(device_id)
                print(f"[updates] ⏰ Background thread: Grace period expired for device {device_id} - milk is over, sending 'milk is over' alert")
    
    # Send "milk is over" alerts for expired devices
    for device_id in expired_devices:
        del _device_carton_removal_tracking[device_id]
        
        # Send "milk is over" alert
        users = find_all_users_by_device(device_id)
        if not users:
            print(f"[updates] ❌ Background thread: No users found for device_id='{device_id}', skipping alert")
            continue

        print(f"[updates] 🚨 Background thread: MILK IS OVER ALERT! Sending 'milk is over' email")
        print(f"[updates]  Found {len(users)} user(s) connected to device {device_id}")

        # Send "milk is over" alerts to all users connected to this device
        for user in users:
            user_email = user.get("email")
            full_name = user.get("full_name")
            
            print(f"[updates] 👤 Background thread: Sending 'milk is over' alert to: {full_name} ({user_email})")
            try:
                send_milk_is_over_email(user_email, full_name)
                print(f"[updates] ✅ Background thread: 'Milk is over' email sent to {user_email}")
            except Exception as e:
                print(f"[updates] ❌ Background thread: Failed to send 'milk is over' email to {user_email}: {e}")

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

def should_send_alert(device_id: str, weight: float) -> tuple[bool, str]:
    """
    Returns (should_send, alert_type)
    alert_type: "200" or "100" or None
    """
    # Check carton removal logic for all weights (including 0g)
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
            if not device_alerts.get("critical"):
                return True, "critical"
        
        # Check for low alert (200g)  
        elif weight < ALERT_THRESHOLD_LOW:
            if not device_alerts.get("warning"):
                return True, "warning"
        
        # Weight is above 200g - reset alerts for refill detection
        elif weight >= 1000:
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
    if alert_type == "critical":
        subject = "🚨 Smart Milk: CRITICAL - Milk Almost Empty!"
        body = (
            f"Hi {full_name or 'there'},\n\n"
            f"🚨 CRITICAL ALERT: Your milk is almost empty!\n"
            f"Current weight: {weight_g:.0f}g\n\n"
            f"Please buy milk immediately - you're running very low!\n\n"
            f"— Smart Milk System"
        )
    else:  # alert_type == "warning"
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
        
        # Get all users for this device
        users = find_all_users_by_device(device_id)
        if not users:
            print(f"[updates] ❌ No users found for device_id='{device_id}', skipping")
            return
        
        print(f"[updates]  Found {len(users)} user(s) connected to device {device_id}")
        
        # FIRST: Handle carton removal logic (this will set/clear grace periods)
        should_alert, alert_type = handle_carton_removal_logic(device_id, weight)
        
        # SECOND: Check for refill AFTER carton removal logic
        previous_weight = _last_weight_by_device.get(device_id, 0)
        is_coming_from_grace_period = (device_id in _device_carton_removal_tracking and 
                                      _device_carton_removal_tracking[device_id].get("grace_period_active", False))
        
        # Only consider it a refill if:
        # 1. Weight increased significantly
        # 2. Weight is above refill threshold
        # 3. NOT coming from a grace period (not 0g → weight)
        # 4. Previous weight was not 0g (to avoid 0g → any weight being considered refill)
        is_refill = (weight > previous_weight and 
                    weight >= REFILL_THRESHOLD_G and 
                    previous_weight > 0 and  # Previous weight must not be 0g
                    not is_coming_from_grace_period)
        
        if is_refill:
            print(f"[updates] 🔄 Milk refilled: {previous_weight}g → {weight}g, resetting user alerts")
            reset_user_alerts_for_device(device_id)
        
        # Update last weight
        _last_weight_by_device[device_id] = weight
        
        # Process alerts for each user
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
                mark_user_alert_sent(user_id, alert_type)
                print(f"[updates] ✅ {alert_type}g alert email sent to {user_email}")
                print(f"[updates] ✅ Marked {alert_type}g alert as sent for user {user_id}")
            else:
                print(f"[updates] ✅ Weight {weight}g >= {user_threshold}g (user threshold); no alerts needed for {user_name}")

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
        print("[updates] 🔄 Grace period checker thread started")
        while True:
            try:
                time.sleep(10)  # Check every 10 seconds
                #print("[updates]  Background thread: Checking grace periods...")
                check_expired_grace_periods()
            except Exception as e:
                print(f"[updates] ❌ Error in grace period checker: {e}")
                time.sleep(10)  # Wait before retrying
    
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