# Smart-Milk-Project

Never run out of milk again!
Smart Milk is an IoT system that monitors the amount of milk left in your fridge and alerts you before it’s too late.

THE PROBLEM: 
We’ve all been there: you wake up in the morning, grab your cereal or coffee… and discover the milk is almost gone.
It’s frustrating, inconvenient, and wastes time with extra supermarket runs.

OUR SOLUTION: 
The Smart Milk Container is a connected IoT device that:
Measures the milk left in your container in real-time
Sends the data securely to the cloud
Notifies you on your phone when the milk is running low
Helps you plan your shopping ahead of time

How It Works:
IoT Device (ESP32 + Load Cell)
Measures milk weight inside the container
Publishes data via MQTT

Backend Services: 
Mosquitto (MQTT broker): handles communication
Analysis Service: analyzes weight data, stores in database
Updates Service: triggers alerts (send notifications via email)
User Service: manages user accounts and preferences

Frontend (React App):
Clean, simple UI to show milk levels and alerts
Accessible from any device (using mail) 

Infrastructure
Runs on Kubernetes
Database: MySQL
Communication: MQTT
