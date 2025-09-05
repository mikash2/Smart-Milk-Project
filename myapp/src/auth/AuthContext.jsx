// src/auth/AuthContext.jsx
import { createContext, useContext, useState } from "react";
import axios from "axios";

const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

// לקוח API עם cookies
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:30001",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Add the same logging interceptors here!
api.interceptors.request.use(
  (config) => {
    console.log(`[UI-AUTH] 📤 Sent ${config.method?.toUpperCase()} request to ${config.url}`, config.data);
    return config;
  }
);

api.interceptors.response.use(
  (response) => {
    console.log(`[UI-AUTH] ✅ Received ${response.status} response from ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.log(`[UI-AUTH] ❌ Received ${error.response?.status || 'Network Error'} from ${error.config?.url}`, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // הרשמה — חובה username + email + password + device_id + phone
  const register = async ({ username, email, password, full_name = null, device_id, phone }) => {
    if (!username || !email || !password || !device_id || !phone) {
      return { ok: false, error: "username, email, password, device_id ו-phone הם חובה" };
    }
    try {
      const { data } = await api.post("/auth/register", {
        username: String(username).trim(),
        email: String(email).trim().toLowerCase(),
        password,
        full_name,
        device_id: String(device_id).trim(),
        phone: String(phone).trim(),
      });
      // השרת לא פותח סשן בהרשמה — נעבור למסך Login
      return { ok: true, data };
    } catch (e) {
      const msg = e.response?.data?.message || "שגיאה בהרשמה";
      return { ok: false, error: msg };
    }
  };

  // התחברות — רק username + password
  const login = async (credentials) => {
    try {
      // ✅ credentials should be {username: "...", password: "..."}
      const response = await api.post('/auth/login', credentials);
      
      if (response.data.success) {
        const userData = {
          id: response.data.user.id,
          username: response.data.user.username,
          email: response.data.user.email,
          full_name: response.data.user.full_name
        };
        
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        return { ok: true };
      } else {
        return { ok: false, error: response.data.message };
      }
    } catch (error) {
      return { ok: false, error: error.response?.data?.message || 'Login failed' };
    }
  };

  // התנתקות — מוחקת סשן בצד השרת ומנקה State
  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    // You can also call the logout API endpoint here
  };

  return (
    <AuthContext.Provider value={{ user, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
