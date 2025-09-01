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
            <label className="label">סיסמה</label>
            <input
              className="input"
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              autoComplete="current-password"
            />
          </div>

          {!validation.ok && <div className="error">{validation.msg}</div>}
          {err && <div className="error">{err}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" type="submit" disabled={loading || !validation.ok}>
              {loading ? "מתחברת..." : "התחברות"}
            </button>
            <Link className="btn btn--ghost" to="/signup">אין לי חשבון</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
