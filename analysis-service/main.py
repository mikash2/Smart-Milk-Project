# analysis-service/main.py
from __future__ import annotations
import os
import time
import math
import json
import threading
from datetime import datetime, timedelta, date

import mysql.connector
import paho.mqtt.client as mqtt

# ======= ENV (compatible with your compose) =======
MQTT_HOST   = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT   = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC  = os.getenv("MQTT_TOPIC", "milk/weight")

MYSQL_CONFIG = {
    "host":     os.getenv("MYSQL_HOST", "mysql"),
    "user":     os.getenv("MYSQL_USER", "milkuser"),
    "password": os.getenv("MYSQL_PASSWORD", "Milk123!"),
    "database": os.getenv("MYSQL_DB", os.getenv("MYSQL_DATABASE", "users_db")),
    "autocommit": True,
}

# schema maps device_id → users(device_id)
DEVICE_ID = os.getenv("DEVICE_ID", "device1")

# ======= Tunables =======
# Lookback window for both daily consumption and cup-size estimation (complete days, excludes today)
WINDOW_DAYS = int(os.getenv("ANALYSIS_WINDOW_DAYS", "7"))

# Cup-size (consumption event) detection thresholds in grams
CUP_MIN_DROP_G = float(os.getenv("CUP_MIN_DROP_G", "25"))    # ignore tiny noise
CUP_MAX_DROP_G = float(os.getenv("CUP_MAX_DROP_G", "350"))   # ignore large refills/removals

# Fallback cup size if we can't infer from data
CUP_DEFAULT_G = float(os.getenv("CUP_DEFAULT_G", "60"))      # ~60 ml ≈ a small coffee

# Require at least this many complete days to trust avg consumption
MIN_DAYS_FOR_AVG = int(os.getenv("MIN_DAYS_FOR_AVG", "2"))

# Baseline "full" calculation:
# 0 → use all-time max; otherwise: use max over last N days
FULL_BASELINE_LOOKBACK_DAYS = int(os.getenv("FULL_BASELINE_LOOKBACK_DAYS", "0"))

# Carton removal detection
CARTON_REMOVAL_GRACE_PERIOD_MIN = int(os.getenv("CARTON_REMOVAL_GRACE_PERIOD_MIN", "1"))  # Wait 1 minute before saving 0g

# Carton removal tracking per device
_device_carton_removal_tracking = {}  # {device_id: {"zero_start_time": datetime}}

# ======= DB Helpers =======
def get_user_id_by_device(conn, device_id: str):
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE device_id = %s", (device_id,))
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None

def init_tables(conn):
    """
    Ensure weight_data exists and user_stats matches the NEW schema (container_id as primary key).
    """
    cur = conn.cursor()

    # 1) Raw readings table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS weight_data (
          id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          device_id VARCHAR(128) NOT NULL,
          weight    FLOAT NOT NULL,
          timestamp DATETIME NOT NULL,
          INDEX(device_id, timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """)

    # 2) user_stats (NEW schema with container_id as primary key)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_stats (
          container_id                VARCHAR(128) NOT NULL,  -- device_id as primary key
          current_amount_g            FLOAT        NULL,      -- latest reading (grams)
          avg_daily_consumption_g     FLOAT        NULL,      -- avg daily consumption
          cups_left                   FLOAT        NULL,      -- current_amount_g / avg_cup_grams
          percent_full                FLOAT        NULL,      -- 0..100
          expected_empty_date         DATE         NULL,      -- projected run-out date
          PRIMARY KEY (container_id)                          -- device_id is the primary key
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """)

    conn.commit()
    cur.close()

def insert_weight(conn, device_id: str, weight: float, ts: datetime):
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO weight_data (device_id, weight, timestamp) VALUES (%s, %s, %s)",
        (device_id, float(weight), ts)
    )
    # No need to commit since autocommit=True
    cur.close()

# ======= Carton Removal Detection =======
def handle_carton_removal_logic(device_id: str, weight: float) -> tuple[bool, float]:
    """
    Handle carton removal detection and return whether to save and what weight to save.
    Returns (should_save, weight_to_save)
    """
    now = datetime.now()
    
    # If weight is not 0g, reset carton removal tracking
    if weight > 0:
        if device_id in _device_carton_removal_tracking:
            print(f"[analysis] 🥛 Carton returned after removal! Current: {weight}g - canceling 0g timer")
            del _device_carton_removal_tracking[device_id]
        return True, weight  # Save immediately
    
    # Weight is 0g - handle carton removal
    if device_id not in _device_carton_removal_tracking:
        # First time seeing 0g, start tracking
        _device_carton_removal_tracking[device_id] = {
            "zero_start_time": now
        }
        print(f"[analysis] 🥛 Carton removal detected for device {device_id} - starting 1 minute grace period")
        return False, None  # Don't save yet, wait for grace period
    
    tracking = _device_carton_removal_tracking[device_id]
    
    # Check if grace period expired
    grace_period_expired = now >= tracking["zero_start_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN)
    
    if grace_period_expired:
        print(f"[analysis] ⏰ Grace period expired for device {device_id} - carton appears to be empty, saving 0g")
        del _device_carton_removal_tracking[device_id]
        return True, 0.0  # Now save 0g as the carton is truly empty
    else:
        remaining_time = (tracking["zero_start_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN) - now).total_seconds()
        print(f"[analysis] ⏳ Carton removal grace period active for device {device_id}, {remaining_time:.0f} seconds remaining")
        return False, None  # Don't save yet, still in grace period

def check_expired_grace_periods():
    """Check if any grace periods have expired and save 0g weights"""
    now = datetime.now()
    expired_devices = []
    
    for device_id, tracking in _device_carton_removal_tracking.items():
        grace_period_expired = now >= tracking["zero_start_time"] + timedelta(minutes=CARTON_REMOVAL_GRACE_PERIOD_MIN)
        
        if grace_period_expired:
            expired_devices.append(device_id)
            print(f"[analysis] ⏰ Grace period expired for device {device_id} - saving 0g weight")
    
    # Save 0g weights for expired devices
    for device_id in expired_devices:
        del _device_carton_removal_tracking[device_id]
        save_weight(device_id, 0.0, 0)  # Save 0g weight

# ======= Analytics =======
def fetch_day_first_last_by_device(conn, device_id: str, start_day: date, end_day_exclusive: date):
    """
    Return rows [(day_date, first_weight, last_weight)] for days in [start_day, end_day_exclusive),
    where each day is COMPLETE. Use GROUP BY date(timestamp) and join to first/last timestamps.
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT d.d,
               w1.weight AS first_w,
               w2.weight AS last_w
        FROM (
            SELECT DATE(timestamp) AS d,
                   MIN(timestamp) AS t_min,
                   MAX(timestamp) AS t_max
            FROM weight_data
            WHERE device_id=%s
              AND timestamp >= %s
              AND timestamp <  %s
            GROUP BY DATE(timestamp)
        ) d
        LEFT JOIN weight_data w1
          ON w1.device_id=%s AND w1.timestamp = d.t_min
        LEFT JOIN weight_data w2
          ON w2.device_id=%s AND w2.timestamp = d.t_max
        ORDER BY d.d ASC
    """, (
        device_id,
        datetime.combine(start_day, datetime.min.time()),
        datetime.combine(end_day_exclusive, datetime.min.time()),
        device_id, device_id
    ))
    rows = cur.fetchall()
    cur.close()

    out = []
    for d, first_w, last_w in rows:
        if first_w is not None and last_w is not None:
            out.append((d, float(first_w), float(last_w)))
    return out

def robust_average_daily_consumption(conn, device_id: str) -> float | None:
    """
    Average of (start_of_day - end_of_day) across the last WINDOW_DAYS complete days, excluding today.
    Only positive deltas are counted (ignores refills/noise).
    """
    today = date.today()
    start_day = today - timedelta(days=WINDOW_DAYS)
    # consider full days: from start_day .. yesterday
    day_rows = fetch_day_first_last_by_device(conn, device_id, start_day, today)
    daily_uses = []
    for _, first_w, last_w in day_rows:
        delta = first_w - last_w
        if delta > 0:
            daily_uses.append(delta)
    if len(daily_uses) < MIN_DAYS_FOR_AVG:
        return None
    return sum(daily_uses) / len(daily_uses)

def median(values):
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    m = n // 2
    return s[m] if n % 2 == 1 else 0.5 * (s[m-1] + s[m])

def estimate_avg_cup_grams(conn, device_id: str) -> float:
    """
    Estimate average 'cup' usage from recent drops between consecutive readings
    within [CUP_MIN_DROP_G, CUP_MAX_DROP_G] over the last WINDOW_DAYS.
    Uses the median for robustness; falls back to CUP_DEFAULT_G.
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT weight
        FROM weight_data
        WHERE device_id=%s
          AND timestamp >= (NOW() - INTERVAL %s DAY)
        ORDER BY timestamp ASC
    """, (device_id, WINDOW_DAYS))
    weights = [float(w) for (w,) in cur.fetchall()]
    cur.close()

    drops = []
    for i in range(1, len(weights)):
        drop = weights[i-1] - weights[i]
        if CUP_MIN_DROP_G <= drop <= CUP_MAX_DROP_G:
            drops.append(drop)

    cup = median(drops)
    if cup is None or cup <= 0:
        cup = CUP_DEFAULT_G
    return cup

def compute_full_baseline_g(conn, device_id: str) -> float | None:
    """
    Baseline "full" weight. By default, uses ALL-TIME MAX. If FULL_BASELINE_LOOKBACK_DAYS > 0,
    uses the max over that rolling window to adapt quicker to new containers.
    """
    cur = conn.cursor()
    if FULL_BASELINE_LOOKBACK_DAYS > 0:
        cur.execute("""
            SELECT MAX(weight)
            FROM weight_data
            WHERE device_id=%s
              AND timestamp >= (NOW() - INTERVAL %s DAY)
        """, (device_id, FULL_BASELINE_LOOKBACK_DAYS))
    else:
        cur.execute("""
            SELECT MAX(weight)
            FROM weight_data
            WHERE device_id=%s
        """, (device_id,))
    row = cur.fetchone()
    cur.close()
    return float(row[0]) if row and row[0] is not None else None

def upsert_user_stats(conn, device_id: str,
                      current_amount_g: float,
                      avg_daily_g: float | None,
                      cups_left: float | None,
                      percent_full: float | None,
                      expected_empty_date):
    """
    Write stats using container_id (device_id) as primary key
    """
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO user_stats (
            container_id, current_amount_g, avg_daily_consumption_g,
            cups_left, percent_full, expected_empty_date
        ) VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            current_amount_g=VALUES(current_amount_g),
            avg_daily_consumption_g=VALUES(avg_daily_consumption_g),
            cups_left=VALUES(cups_left),
            percent_full=VALUES(percent_full),
            expected_empty_date=VALUES(expected_empty_date)
    """, (
        device_id, current_amount_g, avg_daily_g,
        cups_left, percent_full, expected_empty_date
    ))
    conn.commit()
    cur.close()

# Add global message counter at the top level
message_counter = 0

# ======= MQTT callbacks =======
def on_connect(client, userdata, flags, rc, properties=None):
    client.subscribe(MQTT_TOPIC)
    print(f"[analysis] Connected to MQTT and subscribed to {MQTT_TOPIC}")

def on_message(client, userdata, msg, properties=None):
    global message_counter
    message_counter += 1
    
    try:
        payload = msg.payload.decode().strip()
        
        # Try to parse as JSON first
        try:
            data = json.loads(payload)
            device_id = data.get("device_id", DEVICE_ID)
            weight = float(data.get("weight"))
            message_id = data.get("message_id", "unknown")
            
            print(f"[analysis] Message #{message_counter}: Received from device {device_id}, weight {weight}g, msg_id: {message_id}")
            
        except (json.JSONDecodeError, KeyError, TypeError):
            # Fallback to old format (plain number)
            weight = float(payload)
            device_id = DEVICE_ID
            
            print(f"[analysis] Message #{message_counter}: Received legacy format from device {device_id}, weight {weight}g")
        
        # Handle carton removal logic
        should_save, weight_to_save = handle_carton_removal_logic(device_id, weight)
        
        if should_save:
            save_weight(device_id, weight_to_save, message_counter)
        else:
            print(f"[analysis] Message #{message_counter}: Weight {weight}g - carton removal grace period active, not saving yet")
        
    except Exception as e:
        print(f"[analysis] Message #{message_counter}: ERROR - {e}")

# ======= Save flow =======
def save_weight(device_id: str, weight: float, msg_num: int):
    try:
        # Create a fresh connection for each operation
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        
        current_amount_g = float(weight)
        
        # Insert weight data with precise timestamp
        cur = conn.cursor()
        now = datetime.now()
        
        cur.execute(
            "INSERT IGNORE INTO weight_data (device_id, weight, timestamp) VALUES (%s, %s, %s)",
            (device_id, current_amount_g, now)
        )
        cur.close()
        
        # Calculate intelligent analytics
        percent_full = min(100.0, (current_amount_g / 1000.0) * 100)  # Assume 1000g is full
        
        # Get learned cup size from recent weight drops
        learned_cup_size = calculate_learned_cup_size(conn, device_id)
        cups_left = math.floor(current_amount_g / learned_cup_size) if learned_cup_size > 0 else 0
        
        # Get learned daily consumption
        learned_daily_consumption = calculate_learned_daily_consumption(conn, device_id)
        
        # Calculate days left until empty
        expected_empty_date = None
        if learned_daily_consumption > 0 and current_amount_g > 0:
            days_left = current_amount_g / learned_daily_consumption
            if days_left > 0:
                expected_empty_date = datetime.now().date() + timedelta(days=int(days_left))
        
        # Update user_stats using device_id (container_id)
        upsert_user_stats(conn, device_id, current_amount_g, learned_daily_consumption,
                         cups_left, percent_full, expected_empty_date)
        
        print(f"[analysis] Message #{msg_num}: Analytics saved to MySQL - {cups_left} cups left, {percent_full:.1f}% full")
        conn.close()
        
    except Exception as e:
        print(f"[analysis] Message #{msg_num}: ERROR saving to MySQL - {e}")
        try:
            conn.close()
        except:
            pass

def calculate_learned_cup_size(conn, device_id: str) -> float:
    """
    Calculate average cup size by analyzing weight drops in the last 7 days.
    A weight drop is detected when weight decreases significantly between readings.
    """
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT weight, timestamp 
            FROM weight_data 
            WHERE device_id = %s 
            AND timestamp >= (NOW() - INTERVAL 7 DAY)
            ORDER BY timestamp ASC
        """, (device_id,))
        weights = cur.fetchall()
        cur.close()
        
        if len(weights) < 2:
            return 60.0  # Default if not enough data
        
        # Calculate weight drops (when user pours coffee)
        drops = []
        for i in range(1, len(weights)):
            current_weight = float(weights[i][0])
            previous_weight = float(weights[i-1][0])
            drop = previous_weight - current_weight
            
            # Filter for realistic coffee cup sizes (25g to 350g)
            if 25 <= drop <= 350:
                drops.append(drop)
        
        if not drops:
            return 60.0  # Default if no valid drops found
        
        # Calculate average cup size from drops
        avg_cup_size = sum(drops) / len(drops)
        return avg_cup_size
        
    except Exception as e:
        print(f"[analysis] Error calculating cup size: {e}")
        return 60.0  # Default fallback

def calculate_learned_daily_consumption(conn, device_id: str) -> float:
    """
    Calculate average daily consumption by analyzing daily weight changes.
    """
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DATE(timestamp) as date, 
                   MAX(weight) as max_weight,
                   MIN(weight) as min_weight
            FROM weight_data 
            WHERE device_id = %s 
            AND timestamp >= (NOW() - INTERVAL 7 DAY)
            GROUP BY DATE(timestamp)
            HAVING COUNT(*) > 1
        """, (device_id,))
        daily_data = cur.fetchall()
        cur.close()
        
        if not daily_data:
            return 200.0  # Default if no data
        
        # Calculate daily consumption (max - min for each day)
        daily_consumptions = []
        for date, max_weight, min_weight in daily_data:
            consumption = float(max_weight) - float(min_weight)
            if consumption > 0:  # Only count positive consumption
                daily_consumptions.append(consumption)
        
        if not daily_consumptions:
            return 200.0  # Default if no valid consumption data
        
        avg_daily = sum(daily_consumptions) / len(daily_consumptions)
        return avg_daily
        
    except Exception as e:
        print(f"[analysis] Error calculating daily consumption: {e}")
        return 200.0  # Default fallback

def main():
    # Start a background thread to check expired grace periods
    def grace_period_checker():
        while True:
            time.sleep(10)  # Check every 10 seconds
            check_expired_grace_periods()
    
    grace_thread = threading.Thread(target=grace_period_checker, daemon=True)
    grace_thread.start()
    print("[analysis] 🔄 Started grace period checker thread")

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