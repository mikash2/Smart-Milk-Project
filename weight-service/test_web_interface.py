import os
import sys

def main():
    mode = os.getenv("MODE", "simulation").lower()
    
    if mode == "web":
        print("[weight] Starting in WEB INTERFACE mode", flush=True)
        from web_interface import app
        import threading
        from web_interface import connect_mqtt
        
        # Connect to MQTT in background
        mqtt_thread = threading.Thread(target=connect_mqtt)
        mqtt_thread.daemon = True
        mqtt_thread.start()
        
        # Start Flask app
        app.run(host='0.0.0.0', port=5000, debug=False)
        
    elif mode == "simulation":
        print("[weight] Starting in SIMULATION mode", flush=True)
        from main import *
        
        try:
            connect_mqtt()
            print("[weight] Starting MQTT client loop...", flush=True)
            client.loop_start()
            
            publish_weight()
            
        except KeyboardInterrupt:
            print("[weight] Service stopped by user", flush=True)
            client.loop_stop()
            client.disconnect()
        except Exception as e:
            print(f"[weight] Fatal error: {e}", flush=True)
            raise
    else:
        print(f"[weight] ERROR: Unknown mode '{mode}'. Use 'simulation' or 'web'", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
