# 🥛 Smart Milk Container

**Never run out of milk again!** Smart Milk is an IoT system that monitors the amount of milk left in your fridge and alerts you before it’s too late.

---

## 🧐 The Problem
Many people start their day with coffee or cereal, only to discover the milk has run out. Since milk cartons are opaque, it's hard to track how much is left, and consumption habits vary daily. This leads to two main issues:
1.  Running out of milk when you need it most.
2.  Overbuying and wasting milk that spoils.

## 💡 Our Solution
The **Smart Milk Container** solves this by using a weight sensor to monitor milk levels in real-time.
* **Real-time Tracking:** Measures remaining milk directly from the fridge.
* **Smart Predictions:** Analyzes consumption to predict when milk will run out.
* **Notifications:** Sends alerts (via email/app) when levels are low.

---

## 🏗️ Architecture & Microservices
The system is built as a set of microservices running on **Kubernetes**, ensuring scalability and high availability.

### Services Breakdown
| Service | Responsibility |
| :--- | :--- |
| **Weight Service** | Interfaces with the load cell to read raw weight data. |
| **MQTT Service** | Handles message brokering using **Mosquitto**. |
| **Analysis Service** | Processes raw data to calculate current milk levels and usage trends. |
| **Updates Service** | Manages alerts and sends notifications to users. |
| **Users Service** | Handles user registration, login, and profile management. |
| **UI Service** | Serves the React frontend application. |

### System Flow
1.  **Registration:** User registers and logs in via the Frontend.
2.  **Measurement:** The IoT device (ESP32 + Load Cell) sends weight data to the **MQTT Broker**.
3.  **Processing:** The **Analysis Service** consumes the data, processes it, and stores history in **MySQL**.
4.  **Action:** If milk is low, the **Updates Service** triggers an email alert.

---

## 🛠️ Tech Stack

### Hardware 🔌
* **Microcontroller:** ESP32 / Arduino Uno
* **Sensors:** HX711 Load Cell Amplifier + Weight Sensor

### Backend & DevOps ⚙️
* **Language:** Node.js
* **Database:** MySQL
* **Message Broker:** MQTT (Mosquitto)
* **Orchestration:** Kubernetes (K8s)
* **Containerization:** Docker

### Frontend 💻
* **Framework:** React.js
* **Tools:** Axios, HTML/CSS

---

## 🚀 Getting Started

### Prerequisites
* Kubernetes Cluster (Minikube / Cloud)
* Docker
* Node.js & npm

### Installation
1.  **Clone the repo:**
    ```bash
    git clone [https://github.com/your-username/smart-milk-container.git](https://github.com/your-username/smart-milk-container.git)
    ```
2.  **Deploy Microservices (K8s):**
    ```bash
    kubectl apply -f k8s/
    ```
3.  **Run Frontend:**
    ```bash
    cd frontend
    npm install
    npm start
    ```
