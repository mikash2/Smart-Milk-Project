import mysql.connector
import os
from datetime import datetime

# Test MySQL connection and insert
MYSQL_CONFIG = {
    "host": "smart-milk-mysql-service",
    "user": "milkuser",
    "password": "Milk123!",
    "database": "users_db",
    "autocommit": True,
}

try:
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    print("✅ Connected to MySQL successfully!")
    
    # Test insert
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO weight_data (device_id, weight, timestamp) VALUES (%s, %s, %s)",
        ("device1", 950.0, datetime.now())
    )
    print("✅ Inserted test weight data!")
    
    # Check if it was saved
    cur.execute("SELECT COUNT(*) FROM weight_data")
    count = cur.fetchone()[0]
    print(f"✅ Total weight records: {count}")
    
    cur.close()
    conn.close()
    print("✅ Test completed successfully!")
    
except Exception as e:
    print(f"❌ Error: {e}")

