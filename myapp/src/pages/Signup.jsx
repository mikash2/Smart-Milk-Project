import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirm: "",
    full_name: "",
    phone: "",
    device_id: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // ולידציה בסיסית בצד לקוח
  const validation = useMemo(() => {
    const username = form.username.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    const confirm = form.confirm;
    const deviceId = form.device_id.trim();
  
    if (!username || !email || !password || !confirm || !deviceId) {
      return { ok: false, msg: "נא למלא את כל השדות" };
    }
    if (!/^[a-zA-Z0-9._-]{3,100}$/.test(username)) {
      return { ok: false, msg: "שם משתמש לא תקין (3–100 תווים, אותיות/ספרות/._-)" };
    }
    if (!emailRe.test(email)) {
      return { ok: false, msg: "אימייל לא תקין" };
    }
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(deviceId)) {
      return { ok: false, msg: "device_id לא תקין (3–50 תווים, אותיות/ספרות/._-)" };
    }
    if (password.length < 6) {
      return { ok: false, msg: "סיסמה חייבת להיות באורך מינימלי 6" };
    }
    if (password !== confirm) {
      return { ok: false, msg: "האימות לא תואם לסיסמה" };
    }
    return { ok: true, msg: "" };
  }, [form]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!validation.ok) {
      setErr(validation.msg);
      return;
    }

    setLoading(true);
    const res = await register({
      username: form.username.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      full_name: form.full_name.trim() || null,
      phone: form.phone.trim() || null,
      device_id: form.device_id.trim(), // מספר מכשיר
    });
    setLoading(false);

    if (res.ok) {
      navigate("/dashboard", { replace: true });
    } else {
      setErr(res.error || "שגיאה בהרשמה");
    }
  };

  return (
    <div className="auth auth--compact" dir="rtl">
      <div className="card auth__card max-420">
        <h1 className="auth__title">הרשמה ל-Smart Milk</h1>
        <p className="auth__subtitle">צרי חשבון חדש כדי להתחבר למכשיר</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth__group">
            <label className="label">שם מלא (אופציונלי)</label>
            <input
              className="input"
              name="full_name"
              value={form.full_name}
              onChange={onChange}
            />
          </div>
          <div className="auth__group">
            <label className="label">שם משתמש</label>
            <input
              className="input"
              name="username"
              value={form.username}
              onChange={onChange}
              autoComplete="username"
            />
          </div>

          <div className="auth__group">
            <label className="label">אימייל</label>
            <input
              className="input"
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              autoComplete="email"
            />
          </div>

          <div className="auth__group">
            <label className="label">טלפון (אופציונלי)</label>
            <input
              className="input"
              name="phone"
              value={form.phone}
              onChange={onChange}
            />
          </div>

          <div className="auth__group">
            <label className="label">מספר מכשיר</label>
            <input
              className="input"
              name="device_id"
              value={form.device_id}
              onChange={onChange}
            />
          </div>
          
          <div className="auth__group">
            <label className="label">סיסמה</label>
            <input
              className="input"
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              autoComplete="new-password"
            />
          </div>

          <div className="auth__group">
            <label className="label">אימות סיסמה</label>
            <input
              className="input"
              type="password"
              name="confirm"
              value={form.confirm}
              onChange={onChange}
              autoComplete="new-password"
            />
          </div>

          {!validation.ok && <div className="error">{validation.msg}</div>}
          {err && <div className="error">{err}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" type="submit" disabled={loading || !validation.ok}>
              {loading ? "נרשמת..." : "הרשמה"}
            </button>
            <Link className="btn btn--ghost" to="/">כבר יש לי חשבון</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
