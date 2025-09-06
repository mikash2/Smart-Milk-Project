// src/pages/MilkSettings.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { getMilkSettings, updateMilkSettings } from "../auth/api";
import { useNavigate } from "react-router-dom";
import "../styles.css";

export default function MilkSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await getMilkSettings(user?.id);
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
      const response = await updateMilkSettings({
        userId: user?.id,
        ...settings
      });
      if (response.data.success) {
        alert("הגדרות החלב נשמרו בהצלחה!");
        navigate("/dashboard");
      }
    } catch (err) {
      console.error("Error saving milk settings:", err);
      alert("שגיאה בשמירת הגדרות החלב");
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
        
        <h1 className="auth__title">🥛 הגדרות חלב</h1>
        <p className="auth__subtitle">עדכן את הגדרות המכשיר והחלב שלך</p>

        {settings && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="auth__group">
              <label className="label">מזהה מכשיר</label>
              <input
                className="input"
                name="device_id"
                value={settings.device_id || ''}
                onChange={handleChange}
                required
                placeholder="DEVICE001"
              />
            </div>

            <div className="auth__group">
              <label className="label">סף התראה (בגרם)</label>
              <input
                className="input"
                type="number"
                name="threshold_wanted"
                value={settings.threshold_wanted || 20}
                onChange={handleChange}
                min="1"
                max="100"
                required
                placeholder="20"
              />
              <small className="form-help">כאשר כמות החלב תגיע לסף זה, תקבל התראה</small>
            </div>

            <div className="auth__group">
              <label className="label">תאריך תפוגה</label>
              <input
                className="input"
                type="date"
                name="expiry_date"
                value={settings.expiry_date || ''}
                onChange={handleChange}
                placeholder="תאריך תפוגה"
              />
              <small className="form-help">תאריך התפוגה של החלב במכשיר</small>
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
