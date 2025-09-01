// src/auth/AuthContext.jsx
import { createContext, useContext, useState } from "react";
import axios from "axios";

const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

// לקוח API עם cookies
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:30000",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // הרשמה — חובה username + email + password
  const register = async ({ username, email, password, full_name = null }) => {
    if (!username || !email || !password) {
      return { ok: false, error: "username, email ו-password הם חובה" };
    }
    try {
      const { data } = await api.post("/auth/register", {
        username: String(username).trim(),
        email: String(email).trim().toLowerCase(),
        password,
        full_name,
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
