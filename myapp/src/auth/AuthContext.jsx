// src/auth/AuthContext.jsx
import { createContext, useContext, useState } from "react";
import axios from "axios";

const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

// לקוח API עם cookies
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("auth_user");
    return saved ? JSON.parse(saved) : null;
  });

  // הרשמה — חובה username + email + password
  const register = async ({ username, email, password, full_name = null }) => {
    if (!username || !email || !password) {
      return { ok: false, error: "username, email ו-password הם חובה" };
    }
    try {
      const { data } = await api.post("/register", {
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
  const login = async (username, password) => {
    if (!username || !password) {
      return { ok: false, error: "username ו-password הם חובה" };
    }
    try {
      const { data } = await api.post("/login", {
        username: String(username).trim(),
        password,
      });
      // השרת יוצר סשן (קוקי httpOnly); שומרים info קל ל-UI
      const u = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email ?? null,
        full_name: data.user.full_name ?? null,
      };
      setUser(u);
      localStorage.setItem("auth_user", JSON.stringify(u));
      return { ok: true };
    } catch (e) {
      const msg = e.response?.data?.message || "שם משתמש או סיסמה שגויים";
      return { ok: false, error: msg };
    }
  };

  // התנתקות — מוחקת סשן בצד השרת ומנקה State
  const logout = async () => {
    try { await api.post("/logout"); } catch { /* לא חוסם UI */ }
    setUser(null);
    localStorage.removeItem("auth_user");
  };

  return (
    <AuthContext.Provider value={{ user, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
