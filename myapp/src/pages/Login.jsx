import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    password: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // Add validation logic
  const validation = useMemo(() => {
    const username = form.username.trim();
    const password = form.password;

    if (!username || !password) {
      return { ok: false, msg: "נא למלא את כל השדות" };
    }
    return { ok: true, msg: "" };
  }, [form]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setShowValidation(true);

    if (!validation.ok) {
      setErr(validation.msg);
      return;
    }

    setLoading(true);
    const res = await login({
      username: form.username.trim(),
      password: form.password
    });
    setLoading(false);

    if (res.ok) {
      navigate("/dashboard", { replace: true });
    } else {
      setErr(res.error || "שגיאה בהתחברות");
    }
  };

  return (
    <div className="auth auth--compact" dir="rtl">
      <div className="card auth__card max-420">
        <h1 className="auth__title">התחברות ל-Smart Milk</h1>
        <p className="auth__subtitle">התחברי לחשבון שלך</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth__group">
            <label className="label">שם משתמש<span className="required-asterisk">*</span></label>
            <input
              className="input"
              name="username"
              value={form.username}
              onChange={onChange}
              autoComplete="username"
              placeholder="הכנס שם משתמש"
            />
          </div>

          <div className="auth__group">
            <label className="label">סיסמה<span className="required-asterisk">*</span></label>
            <input
              className="input"
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              autoComplete="current-password"
              placeholder="הכנס סיסמה"
            />
          </div>

          {showValidation && !validation.ok && <div className="error">{validation.msg}</div>}
          {err && <div className="error">{err}</div>}

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "מתחברת..." : "התחברות"}
            </button>
            <Link className="btn btn--ghost" to="/signup">אין לי חשבון</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
