import { useAuth } from "../auth/AuthContext";

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div dir="rtl">
      <header className="header">
        <div className="brand">
          <span className="brand__dot" />
          <span>Smart Milk</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#94a3b8", fontSize: 14 }}>
            שלום, {user?.username}
          </span>
          <button className="btn btn--danger" onClick={logout}>
            התנתקות
          </button>
        </div>
      </header>

      {/* מרכז את התוכן מתחת ל־Header */}
      <main className="shell-center">
        <div className="max-1100" style={{ width: "100%" }}>
          {/* סטטוסים עליונים */}
          <section className="grid grid--3" style={{ marginBottom: 16 }}>
            <article className="card stat">
              <div className="stat__label">כמות נוכחית</div>
              <div className="stat__value">1.2 ליטר</div>
              <div className="stat__trend">+0.1 ל׳ מאז אתמול</div>
            </article>

            <article className="card stat">
              <div className="stat__label">צריכה יומית ממוצעת</div>
              <div className="stat__value">220 מ״ל</div>
              <div className="stat__trend stat__trend--warn">עולה ב-12%</div>
            </article>

            <article className="card stat">
              <div className="stat__label">חיזוי סיום</div>
              <div className="stat__value">18/08/2025</div>
              <div className="stat__trend stat__trend--bad">
                קריטי בעוד 3 ימים
              </div>
            </article>
          </section>

          {/* פאנלים נוספים */}
          <section className="grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <article className="card panel">
              <h3 className="panel__title">אירועים אחרונים</h3>
              <div className="row">
                <span>מילוי מיכל</span>
                <span className="chip">+0.9 ל׳</span>
              </div>
              <div className="row">
                <span>צריכה</span>
                <span className="chip">-180 מ״ל</span>
              </div>
              <div className="row">
                <span>צריכה</span>
                <span className="chip">-40 מ״ל</span>
              </div>
            </article>

            <article className="card panel">
              <h3 className="panel__title">מצב חיישן</h3>
              <div className="row">
                <span>חיבור</span>
                <span className="chip">MQTT: מחובר</span>
              </div>
              <div className="row">
                <span>סוללה</span>
                <span className="chip">88%</span>
              </div>
              <div className="row">
                <span>קליברציה</span>
                <span className="chip">מומלץ בקרוב</span>
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}
