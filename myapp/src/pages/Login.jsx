import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await login(username.trim(), password);
    setLoading(false);
    if (res.ok) {
      navigate("/dashboard", { replace: true });
    } else {
      setErr(res.error || "שגיאת התחברות");
    }
  };

  return (
    <div className="center-screen" dir="rtl">
      <div className="card auth__card max-420">
        <h1 className="auth__title">Smart Milk</h1>
        <p className="auth__subtitle">התחברי כדי לראות את מצב המיכל שלך</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth__group">
            <label className="label">שם משתמש</label>
            <input
              className="input"
              placeholder="למשל: demo"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="auth__group">
            <label className="label">סיסמה</label>
            <input
              className="input"
              type="password"
              placeholder="למשל: demo123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {err && <div className="error">{err}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "נכנס..." : "התחבר"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setUsername("demo");
                setPassword("demo123");
                setErr("");
              }}
            >
              מלא פרטי דמו
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 14, color: "#94a3b8" }}>
            אין לך חשבון? <Link to="/Signup" className="link">להרשמה</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
