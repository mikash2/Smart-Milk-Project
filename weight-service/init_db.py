# weight-service/db_init.py
def init_db():
    conn = mysql.connector.connect(
        host="mysql",
        user="milkuser",
        password="milkpass",
        database="milkdb"
    )
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS raw_measurements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id VARCHAR(50) NOT NULL,
        raw_value FLOAT NOT NULL,
        calibrated_value FLOAT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES client_devices(device_id)
    )
    """)
    
    conn.commit()
    conn.close()