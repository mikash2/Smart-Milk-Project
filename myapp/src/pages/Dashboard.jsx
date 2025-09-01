// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { getDashboard } from "../auth/api";
import { useNavigate } from "react-router-dom";

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d) ? "-" : d.toLocaleDateString("he-IL");
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

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!user || !user.id) {
        setError("User not authenticated");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await getDashboard(user.id);
        
        if (response.data.success) {
          setDashboardData(response.data);
        } else {
          setError(response.data.message || "Failed to load dashboard");
        }
      } catch (error) {
        setError(error.response?.data?.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading">טוען דשבורד...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error">שגיאה: {error}</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="dashboard">
        <div className="error">אין נתונים זמינים</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header Section */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1 className="app-title">SmartMilk</h1>
          <div className="user-section">
            <span className="greeting">שלום {user?.username}</span>
            <button className="logout-btn" onClick={handleLogout}>
              התנתקות
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-content">
        <div className="dashboard-grid">
          {/* Milk Amount Card */}
          <div className="info-card">
            <div className="card-header">
              <h3 className="card-title">כמות חלב נוכחית</h3>
            </div>
            <div className="card-value">
              {fmtMl(dashboardData.currentMilkAmount)}
            </div>
            <div className="card-subtitle">
              {dashboardData.percentFull}% מלא
            </div>
          </div>

          {/* Coffee Cups Left Card */}
          <div className="info-card">
            <div className="card-header">
              <h3 className="card-title">כוסות קפה שנותרו</h3>
            </div>
            <div className="card-value">
              {dashboardData.coffeeCupsLeft || 0}
            </div>
            <div className="card-subtitle">
              כוסות זמינות
            </div>
          </div>

          {/* Daily Consumption Card */}
          <div className="info-card">
            <div className="card-header">
              <h3 className="card-title">צריכה יומית ממוצעת</h3>
            </div>
            <div className="card-value">
              {fmtMl(dashboardData.averageDailyConsumption)}
            </div>
            <div className="card-subtitle">
              ליום
            </div>
          </div>

          {/* Expected Empty Date Card */}
          <div className="info-card">
            <div className="card-header">
              <h3 className="card-title">תאריך ריק צפוי</h3>
            </div>
            <div className="card-value">
              {fmtDate(dashboardData.expectedMilkEndDay)}
            </div>
            <div className="card-subtitle">
              לפי הצריכה הנוכחית
            </div>
          </div>

          {/* Sensor Status Card */}
          <div className="info-card">
            <div className="card-header">
              <h3 className="card-title">סטטוס חיישן</h3>
            </div>
            <div className="card-value">
              {dashboardData.isWeightSensorActive ? 'פעיל' : 'לא פעיל'}
            </div>
            <div className="card-subtitle">
              חיישן משקל
            </div>
          </div>

          {/* Last Updated Card */}
          <div className="info-card">
            <div className="card-header">
              <h3 className="card-title">עדכון אחרון</h3>
            </div>
            <div className="card-value">
              {fmtDate(dashboardData.lastUpdated)}
            </div>
            <div className="card-subtitle">
              נתונים
            </div>
          </div>
        </div>

        {/* Device Info Section */}
        <div className="device-info-section">
          <h3 className="section-title">מידע על המכשיר</h3>
          <div className="device-details">
            <div className="detail-item">
              <span className="detail-label">מזהה משתמש:</span>
              <span className="detail-value">{dashboardData.userId}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">מזהה מכשיר:</span>
              <span className="detail-value">{dashboardData.deviceId}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
