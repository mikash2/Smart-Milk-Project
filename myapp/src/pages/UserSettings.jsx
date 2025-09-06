// src/pages/UserSettings.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { getUserSettings, updateUserSettings } from "../auth/api";
import { useNavigate } from "react-router-dom";
import "../styles.css";

export default function UserSettings() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await getUserSettings(user?.id);
      if (response.data.success) {
        setSettings(response.data);
        setError(null);
      } else {
        setError(response.data.message || "שגיאה בטעינת הגדרות");
      }
    } catch (err) {
      setError(err.response?.data?.message || "שגיאה בטעינת הגדרות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadSettings();
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const response = await updateUserSettings({
        userId: user?.id,
        ...settings
      });
      if (response.data.success) {
        // Update the user data in AuthContext
        updateUser({
          username: settings.username,
          email: settings.email,
          full_name: settings.full_name,
          phone: settings.phone
        });
        
        alert("הגדרות המשתמש נשמרו בהצלחה!");
        navigate("/dashboard");
      }
    } catch (err) {
      console.error("Error saving user settings:", err);
      alert("שגיאה בשמירת הגדרות המשתמש");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    setSettings({
      ...settings,
      [e.target.name]: e.target.value
    });
  };

  if (loading) {
    return (
      <div className="center-screen">
        <div className="loading-spinner"></div>
        <p className="loading-text">טוען הגדרות...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="center-screen">
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <p className="error-text">{error}</p>
          <button onClick={() => navigate("/dashboard")} className="btn">חזור לדשבורד</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth auth--compact" dir="rtl">
      <div className="card auth__card max-420">
        <div className="back-button-container">
          <button onClick={() => navigate("/dashboard")} className="btn btn--ghost">
            ← חזור לדשבורד
          </button>
        </div>
        
        <h1 className="auth__title">👤 הגדרות משתמש</h1>
        <p className="auth__subtitle">עדכן את פרטי הפרופיל שלך</p>

        {settings && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="auth__group">
              <label className="label">שם מלא</label>
              <input
                className="input"
                name="full_name"
                value={settings.full_name || ''}
                onChange={handleChange}
                placeholder="הכנס שם מלא"
              />
            </div>

            <div className="auth__group">
              <label className="label">שם משתמש</label>
              <input
                className="input"
                name="username"
                value={settings.username || ''}
                onChange={handleChange}
                required
                placeholder="הכנס שם משתמש"
              />
            </div>

            <div className="auth__group">
              <label className="label">אימייל</label>
              <input
                className="input"
                type="email"
                name="email"
                value={settings.email || ''}
                onChange={handleChange}
                required
                placeholder="your@email.com"
              />
            </div>

            <div className="auth__group">
              <label className="label">טלפון</label>
              <input
                className="input"
                type="tel"
                name="phone"
                value={settings.phone || ''}
                onChange={handleChange}
                required
                placeholder="050-1234567"
              />
            </div>

            <div className="auth__group">
              <label className="label">סיסמה חדשה (השאר ריק אם לא רוצה לשנות)</label>
              <input
                className="input"
                type="password"
                name="password"
                value={settings.password || ''}
                onChange={handleChange}
                placeholder="הכנס סיסמה חדשה"
              />
            </div>

            {error && <div className="error">{error}</div>}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn btn--ghost" type="button" onClick={() => navigate("/dashboard")}>
                ביטול
              </button>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "שומר..." : "עדכן הגדרות"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
