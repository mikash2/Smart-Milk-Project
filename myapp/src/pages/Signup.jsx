import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!form.username || !form.email || !form.password) {
      setErr("נא למלא את כל השדות");
      return;
    }
    // בדיקת התאמת סיסמה
    if (form.password !== form.confirm) {
      setErr("האימות לא תואם לסיסמה");
      return;
    }

    setLoading(true);
    const res = await register({
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password
    });
    setLoading(false);

    if (res.ok) {
      // נווט ישירות ל‑Dashboard אחרי הרשמה
      navigate("/dashboard", { replace: true });
    } else {
      setErr(res.error || "שגיאה בהרשמה");
    }
  };

  return (
    <div className="center-screen" dir="rtl">
      <div className="card auth__card max-420">
        <h1 className="auth__title">הרשמה ל‑Smart Milk</h1>
        <p className="auth__subtitle">צרי חשבון חדש כדי להתחבר למכשיר</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth__group">
            <label className="label">שם משתמש</label>
            <input className="input" name="username" value={form.username} onChange={onChange} />
          </div>

          <div className="auth__group">
            <label className="label">אימייל</label>
            <input className="input" type="email" name="email" value={form.email} onChange={onChange} />
          </div>

          <div className="auth__group">
            <label className="label">סיסמה</label>
            <input className="input" type="password" name="password" value={form.password} onChange={onChange} />
          </div>

          <div className="auth__group">
            <label className="label">אימות סיסמה</label>
            <input className="input" type="password" name="confirm" value={form.confirm} onChange={onChange} />
          </div>

          {err && <div className="error">{err}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "נרשמת..." : "הרשמה"}
            </button>
            <Link className="btn btn--ghost" to="/">כבר יש לי חשבון</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
