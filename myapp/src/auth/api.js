// src/auth/api.js
import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:30000", // Fixed NodePort URL
  withCredentials: true, // שולח/מקבל קוקיז (sid)
  headers: { "Content-Type": "application/json" },
});

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
