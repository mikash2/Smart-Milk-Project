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
    device_id: "",
    phone: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // ולידציה בסיסית בצד לקוח
  const validation = useMemo(() => {
    const username = form.username.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    const confirm = form.confirm;
    const device_id = form.device_id.trim();
    const phone = form.phone.trim();

    if (!username || !email || !password || !confirm || !device_id || !phone) {
      return { ok: false, msg: "נא למלא את כל השדות החובה" };
    }
    if (!/^[a-zA-Z0-9._-]{3,100}$/.test(username)) {
      return { ok: false, msg: "שם משתמש לא תקין (3–100 תווים, אותיות/ספרות/._-)" };
    }
    if (!emailRe.test(email)) {
      return { ok: false, msg: "אימייל לא תקין" };
    }
    if (password.length < 6) {
      return { ok: false, msg: "סיסמה חייבת להיות באורך מינימלי 6" };
    }
    if (password !== confirm) {
      return { ok: false, msg: "האימות לא תואם לסיסמה" };
    }
    if (!/^[0-9\-\+\s\(\)]{10,15}$/.test(phone)) {
      return { ok: false, msg: "מספר טלפון לא תקין (10-15 ספרות)" };
    }
    if (device_id.length < 3 || device_id.length > 50) {
      return { ok: false, msg: "מזהה המכשיר חייב להיות באורך 3-50 תווים" };
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
      device_id: form.device_id.trim(),
      phone: form.phone.trim(),
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
          <div className="grid-2">
            <div className="auth__group">
              <label className="label">שם משתמש<span className="required-asterisk">*</span></label>
              <input
                className="input"
                name="username"
                value={form.username}
                onChange={onChange}
                autoComplete="username"
                placeholder="שם משתמש ייחודי"
              />
            </div>

            <div className="auth__group">
              <label className="label">אימייל<span className="required-asterisk">*</span></label>
              <input
                className="input"
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                autoComplete="email"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="auth__group">
              <label className="label">סיסמה<span className="required-asterisk">*</span></label>
              <input
                className="input"
                type="password"
                name="password"
                value={form.password}
                onChange={onChange}
                autoComplete="new-password"
                placeholder="סיסמה חזקה"
              />
            </div>

            <div className="auth__group">
              <label className="label">אימות סיסמה<span className="required-asterisk">*</span></label>
              <input
                className="input"
                type="password"
                name="confirm"
                value={form.confirm}
                onChange={onChange}
                autoComplete="new-password"
                placeholder="חזור על הסיסמה"
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="auth__group">
              <label className="label">מזהה המכשיר<span className="required-asterisk">*</span></label>
              <input
                className="input"
                name="device_id"
                value={form.device_id}
                onChange={onChange}
                placeholder="DEVICE001"
              />
            </div>
            
            <div className="auth__group">
              <label className="label">מספר טלפון<span className="required-asterisk">*</span></label>
              <input
                className="input"
                type="tel"
                name="phone"
                value={form.phone}
                onChange={onChange}
                placeholder="050-1234567"
              />
            </div>
          </div>

          {!validation.ok && <div className="error">{validation.msg}</div>}
          {err && <div className="error">{err}</div>}

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
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
