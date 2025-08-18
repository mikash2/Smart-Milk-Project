import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);
export function useAuth(){ return useContext(AuthContext); }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("auth_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = async (username, password) => {
    // 🔹 בדיקה מדומה: החליפי בהמשך לקריאה לשרת
    if (username === "demo" && password === "demo123") {
      const u = { username, token: "FAKE_TOKEN_123" };
      setUser(u);
      localStorage.setItem("auth_user", JSON.stringify(u));
      return { ok: true };
    }
    return { ok: false, error: "שם משתמש או סיסמה שגויים" };
  };

   // 🔹 הרשמה (דמו): שומר משתמש ומחבר אותו מייד
  const register = async ({ username, email, password }) => {
    if (!username || !email || !password) {
      return { ok: false, error: "נא למלא את כל השדות" };
    }
    // פה בעתיד: שליחת POST לשרת, בדיקות כפילות וכו'
    const u = { username, email, token: "FAKE_TOKEN_NEW" };
    setUser(u);
    localStorage.setItem("auth_user", JSON.stringify(u));
    return { ok: true };
  };


  const logout = () => {
    setUser(null);
    localStorage.removeItem("auth_user");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

