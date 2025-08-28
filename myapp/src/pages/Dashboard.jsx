// src/pages/Dashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getDashboard } from "../auth/api";
import Sortable from "sortablejs";

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d) ? "-" : d.toLocaleDateString("he-IL");
}
function fmtMl(n) {
  if (n == null) return "-";
  return n >= 1000 ? `${(n / 1000).toFixed(1)} ליטר` : `${Math.round(n)} מ״ל`;
}

const ORDER_KEY = "smartmilk-dash-order-v1";
// סדר ברירת־מחדל של הכרטיסים
const defaultOrder = [
  "cur", "avg", "exp",
  "cups", "finish", "tank",
  "fill", "events", "sensor",
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const gridRef = useRef(null);
  // טוענים סדר שמור (אם קיים)
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY));
      return Array.isArray(saved) && saved.length ? saved : defaultOrder;
    } catch { return defaultOrder; }
  });

  useEffect(() => {
    if (loading || err) return;            // מחכים לנתונים
    if (!gridRef.current) return;

    const sortable = new Sortable(gridRef.current, {
      animation: 150,
      forceFallback: true,                 // יציב יותר בדפדפנים שונים
      ghostClass: "drag-ghost",
      chosenClass: "drag-chosen",
      dragClass: "drag-dragging",
      handle: ".dash-handle",              // גוררים דרך הידית בלבד
    });

    return () => sortable.destroy();
  }, [loading, err]);

  // מפעילים גרירה על הגריד
  useEffect(() => {
    if (!gridRef.current) return;
    const sortable = new Sortable(gridRef.current, {
      animation: 150,
      ghostClass: "drag-ghost",
      dragClass: "drag-dragging",
      handle: ".card",         // כל הכרטיס הוא הידית
      onSort: () => {
        // קוראים את הסדר החדש לפי data-id על כל ילד
        const ids = Array.from(gridRef.current.children).map(el => el.dataset.id);
        setOrder(ids);
        try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); } catch {}
      },
    });
    return () => sortable.destroy();
  }, []);

  const m = data?.metrics;
  const cupsLeft = useMemo(() => {
    const cup = m?.cup_size_ml || 200;
    const ml = m?.milk_current_ml ?? 0;
    return Math.max(0, Math.floor(ml / cup));
  }, [m]);

  // רנדר של כל כרטיס לפי ה-id שלו
  const renderCard = (id) => {
    switch (id) {
      case "cur":
        return (
          <article className="card stat">
            <div className="stat__label">כמות נוכחית</div>
            <div className="stat__value">{fmtMl(m?.milk_current_ml)}</div>
            {m?.delta_since_yesterday_ml != null && (
              <div className={`stat__trend ${m.delta_since_yesterday_ml < 0 ? "stat__trend--bad" : ""}`}>
                {m.delta_since_yesterday_ml >= 0 ? "+" : "-"}{fmtMl(Math.abs(m.delta_since_yesterday_ml))} מאז אתמול
              </div>
            )}
          </article>
        );
      case "avg":
        return (
          <article className="card stat">
            <div className="stat__label">צריכה יומית ממוצעת</div>
            <div className="stat__value">{fmtMl(m?.avg_daily_consumption_ml)}</div>
            {m?.avg_change_pct != null && (
              <div className={`stat__trend ${m.avg_change_pct > 0 ? "stat__trend--warn" : ""}`}>
                {m.avg_change_pct > 0 ? "עולה" : "יורדת"} ב־{Math.abs(m.avg_change_pct)}%
              </div>
            )}
          </article>
        );
      case "exp":
        return (
          <article className="card stat">
            <div className="stat__label">תוקף החלב</div>
            <div className="stat__value">{fmtDate(m?.expiry_date)}</div>
            {m?.days_to_expiry != null && (
              <div className={`stat__trend ${m.days_to_expiry <= 2 ? "stat__trend--bad" : m.days_to_expiry <= 5 ? "stat__trend--warn" : ""}`}>
                {m?.days_to_expiry <= 0 ? "פג תוקף" : `בעוד ${m?.days_to_expiry} ימים`}
              </div>
            )}
          </article>
        );
      case "cups":
        return (
          <article className="card stat">
            <div className="stat__label">כוסות קפה שנותרו</div>
            <div className="stat__value">{cupsLeft}</div>
            <div className="stat__trend">גודל כוס: {(m?.cup_size_ml || 200)} מ״ל</div>
          </article>
        );
      case "finish":
        return (
          <article className="card stat">
            <div className="stat__label">יום צפוי לסיום</div>
            <div className="stat__value">{fmtDate(m?.predicted_finish_date)}</div>
            {m?.days_to_finish != null && (
              <div className={`stat__trend ${m.days_to_finish <= 2 ? "stat__trend--bad" : m?.days_to_finish <= 5 ? "stat__trend--warn" : ""}`}>
                {m?.days_to_finish <= 0 ? "אזל" : `בעוד ${m?.days_to_finish} ימים`}
              </div>
            )}
          </article>
        );
      case "tank":
        return (
          <article className="card stat">
            <div className="stat__label">כמות חלב נוכחית</div>
            <div className="stat__value">{fmtMl(m?.milk_current_ml)}</div>
            {m?.tank_capacity_ml && (
              <div className="stat__trend">{Math.round((m.milk_current_ml / m.tank_capacity_ml) * 100)}% מהמכל</div>
            )}
          </article>
        );
      case "fill":
        return (
          <article className="card stat">
            <div className="stat__label">מילוי המיכל</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div className="milk-carton">
                <div
                  className="milk-fill"
                  style={{ height: `${Math.max(0, Math.min(100, Number(m?.percent_full ?? 0)))}%` }}
                />
              </div>
              <div className="stat__value">{m?.percent_full != null ? `${Math.round(m.percent_full)}%` : "-"}</div>
            </div>
          </article>
        );
      case "events":
        return (
          <article className="card panel">
            <h3 className="panel__title">אירועים אחרונים</h3>
            {(data?.events ?? []).slice(0, 8).map((ev, i) => (
              <div className="row" key={i}>
                <span>{ev.type === "fill" ? "מילוי מיכל" : "צריכה"}</span>
                <span className={`chip ${ev.type === "fill" ? "chip--ok" : "chip--warn"}`}>
                  {ev.type === "fill" ? "+" : "-"}{fmtMl(Math.abs(ev.amount_ml))}
                </span>
              </div>
            ))}
            {!data?.events?.length && (
              <div className="row"><span>אין אירועים</span><span className="chip">—</span></div>
            )}
          </article>
        );
      case "sensor":
        return (
          <article className="card panel">
            <h3 className="panel__title">מצב חיישן</h3>
            <div className="row">
              <span>חיבור</span>
              <span className={`chip ${m?.sensor?.mqtt_connected ? "chip--ok" : "chip--bad"}`}>
                MQTT: {m?.sensor?.mqtt_connected ? "מחובר" : "מנותק"}
              </span>
            </div>
            <div className="row">
              <span>סוללה</span>
              <span className="chip">{m?.sensor?.battery_pct ?? "-"}%</span>
            </div>
            <div className="row">
              <span>קליברציה</span>
              <span className={`chip ${m?.sensor?.calibration_status === "recommended" ? "chip--warn" : ""}`}>
                {m?.sensor?.calibration_status === "ok" ? "תקין" :
                 m?.sensor?.calibration_status === "recommended" ? "מומלץ בקרוב" :
                 m?.sensor?.calibration_status || "-"}
              </span>
            </div>
            <div className="row">
              <span>גרסת קושחה</span>
              <span className="chip">{m?.sensor?.fw ?? "-"}</span>
            </div>
            <div className="row">
              <span>אחרון דיווח</span>
              <span className="chip">{fmtDate(m?.sensor?.last_seen)}</span>
            </div>
          </article>
        );
      default:
        return null;
    }
  };

  return (
    <div dir="rtl">
      <header className="header">
        <div className="brand">
          <span className="brand__dot" />
          <span>Smart Milk</span>
        </div>
        <div className="toolbar">
          <span className="user-chip">שלום, {user?.username}</span>
          <button className="btn btn--danger" onClick={logout}>התנתקות</button>
        </div>
      </header>

      <main className="shell">
        <div className="fullwidth">
          {loading && <div className="card panel" style={{ padding: 18 }}>טוען…</div>}
          {err && !loading && (
            <div className="card panel" style={{ padding: 18 }}>
              <div className="error">{err}</div>
            </div>
          )}

          {!loading && !err && (
            <>
              {/* כפתור איפוס סדר (לא חובה) */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    setOrder(defaultOrder);
                    localStorage.setItem(ORDER_KEY, JSON.stringify(defaultOrder));
                  }}
                >
                  אפסי סידור
                </button>
              </div>

              {/* הגריד הנגרר */}
              <section id="dash-grid" ref={gridRef}>
                {order.map((id) => (
                  <div key={id} data-id={id} className="dash-cell">
                    {renderCard(id)}
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
