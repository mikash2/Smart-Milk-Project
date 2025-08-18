import paho.mqtt.client as mqtt
import mysql.connector
from datetime import datetime
import json

# Configuration
MQTT_HOST = "mqtt"
MQTT_TOPIC = "milk/weight"
MYSQL_CONFIG = {
    "host": "mysql",
    "user": "milkuser",
    "password": "milkpass",
    "database": "milkdb"
}

# MySQL Setup
def init_db():
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    
    # Create tables if not exists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS weight_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(50),
        weight FLOAT,
        timestamp DATETIME
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS client_stats (
        client_id INT,
        avg_weight FLOAT,
        min_weight FLOAT,
        last_updated DATETIME,
        PRIMARY KEY (client_id)
    )
    """)
    
    conn.commit()
    conn.close()

# MQTT Callback
def on_message(client, userdata, msg):
    weight = float(msg.payload.decode())
    print(f"Received weight: {weight}g")
    
    # Store raw data
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO weight_data (device_id, weight, timestamp) VALUES (%s, %s, %s)",
        ("device1", weight, datetime.now())
    )
    
    # Update statistics
    cursor.execute("""
    INSERT INTO client_stats (client_id, avg_weight, min_weight, last_updated)
    VALUES (1, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        avg_weight = (avg_weight + %s) / 2,
        min_weight = LEAST(min_weight, %s),
        last_updated = %s
    """, (weight, weight, datetime.now(), weight, weight, datetime.now()))
    
    conn.commit()
    conn.close()

def main():
    init_db()
    
    client = mqtt.Client()
    client.on_message = on_message
    
    while True:
        try:
            client.connect(MQTT_HOST, 1883)
            client.subscribe(MQTT_TOPIC)
            print("Connected to MQTT and subscribed to topic")
            client.loop_forever()
        except Exception as e:
            print(f"Error: {e}, retrying...")
            time.sleep(5)

if __name__ == "__main__":
    main()