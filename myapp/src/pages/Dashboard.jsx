// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { getDashboard } from "../auth/api";
import { useNavigate } from "react-router-dom";
import "../styles.css";   // ✅ connect CSS file

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d) ? "-" : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMl(n) {
  if (n == null) return "-";
  return n >= 1000 ? `${(n/1000).toFixed(1)} ליטר` : `${Math.round(n)} מ״ל`;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    try {
      const response = await getDashboard(user?.id);
      if (response.data.success) {
        setDashboardData(response.data);
        setError(null);
      } else {
        setError(response.data.message || "שגיאה בטעינת הדשבורד");
      }
    } catch (err) {
      setError(err.response?.data?.message || "שגיאה בטעינת הדשבורד");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      // Initial fetch
      fetchDashboard();
      
      // Auto-refresh every 2 seconds
      const interval = setInterval(fetchDashboard, 2000);
      
      // Cleanup interval on component unmount
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogout = () => {
    if (window.confirm("האם את בטוחה שברצונך להתנתק?")) {
      logout();
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="center-screen">
        <div className="loading-spinner"></div>
        <p className="loading-text">טוען נתונים...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="center-screen">
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <p className="error-text">{error}</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="center-screen">
        <p className="error-text">אין נתונים זמינים</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="brand">
            <div className="brand__dot" />
            <h1 className="app-title">SmartMilk</h1>
          </div>
          <div className="toolbar">
            <span className="user-chip">שלום {user?.username}</span>
            <button className="logout-btn" onClick={handleLogout}>התנתקות</button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="dashboard-content">
        <div className="content-header">
          <h2 className="page-title">📊 סקירה כללית</h2>
          <p className="page-subtitle">מעקב אחר צריכת החלב והמכשיר שלך</p>
        </div>

        {/* Stats Grid */}
        <div className="dashboard-grid">
          <div className="info-card milk-card">
            <h3 className="card-title">כמות חלב נוכחית</h3>
            <p className="card-value">{fmtMl(dashboardData.currentMilkAmount)}</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${dashboardData.percentFull}%` }} />
            </div>
            <small className="progress-text">{dashboardData.percentFull}% מלא</small>
          </div>

          <div className="info-card coffee-card">
            <h3 className="card-title">כוסות קפה</h3>
            <p className="card-value">{dashboardData.coffeeCupsLeft || 0}</p>
            <small className="card-subtitle">כוסות זמינות</small>
          </div>

          <div className="info-card chart-card">
            <h3 className="card-title">צריכה יומית ממוצעת</h3>
            <p className="card-value">{fmtMl(dashboardData.averageDailyConsumption)}</p>
            <small className="card-subtitle">ליום</small>
          </div>

          <div className="info-card calendar-card">
            <h3 className="card-title">תאריך ריק צפוי</h3>
            <p className="card-value">{fmtDate(dashboardData.expectedMilkEndDay)}</p>
          </div>

          <div className="info-card sensor-card">
            <h3 className="card-title">סטטוס חיישן</h3>
            <span className={`card-status ${dashboardData.isWeightSensorActive ? "active" : "inactive"}`}>
              {dashboardData.isWeightSensorActive ? "✅ פעיל" : "❌ לא פעיל"}
            </span>
          </div>

          <div className="info-card clock-card">
            <h3 className="card-title">עדכון אחרון</h3>
            <p className="card-value">{fmtDate(dashboardData.lastUpdated)}</p>
          </div>
        </div>

        {/* Device Info */}
        <div className="device-info-section">
          <h3 className="section-title">🔧 מידע על המכשיר</h3>
          <div className="device-details">
            <div className="detail-item">
              <span className="detail-label">מזהה משתמש</span>
              <span className="detail-value">{dashboardData.userId}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">מזהה מכשיר</span>
              <span className="detail-value">{dashboardData.deviceId}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>© 2025 SmartMilk — All rights reserved</p>
      </footer>
    </div>
  );
}
