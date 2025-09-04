// src/auth/api.js
import axios from "axios";

// Use environment variable or default to K8s port
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:30001";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Add request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`[UI] 📤 Sent ${config.method?.toUpperCase()} request to ${config.url}`, config.data);
    return config;
  }
);

// Add response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`[UI] ✅ Received ${response.status} response from ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.log(`[UI] ❌ Received ${error.response?.status || 'Network Error'} from ${error.config?.url}`, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// ===== Auth =====
export const register = ({ username, password, email, full_name = null }) =>
  api.post("/auth/register", { username, password, email, full_name });

export const login = ({ username, password }) =>
  api.post("/auth/login", { username, password });

export const logout = () => api.post("/auth/logout");

// מי המשתמש המחובר (לא חובה אם כבר יש לך בקונטקסט)
export const me = () => api.get("/me"); // החזר { id, username, ... }

// ===== Dashboard =====
export const getDashboard = (userId) => api.post("/dashboard/status", { userId });
// החזרה צפויה:
// {
//   metrics: {
//     milk_current_ml, tank_capacity_ml, avg_daily_consumption_ml,
//     avg_change_pct, delta_since_yesterday_ml,
//     expiry_date, days_to_expiry,
//     predicted_finish_date, days_to_finish,
//     cup_size_ml,
//     sensor: { mqtt_connected, battery_pct, calibration_status, fw, last_seen }
//   },
//   events: [{ type: "fill"|"consume", amount_ml, ts }, ...]
// }
