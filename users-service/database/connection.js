// database/connection.js
const mysql = require('mysql2/promise');
const config = require('../config');

let pool;
let creatingPromise;

/**
 * מסנן את config.database ומשאיר רק מפתחות חוקיים עבור mysql2.createPool.
 * ממפה timeout -> connectTimeout ומדפיס אזהרה על מפתחות לא נתמכים.
 */
function sanitizeDbConfig(cfg = {}) {
  const DEFAULTS = {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false, // אבטחה
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  // רשימת מפתחות נתמכים ב-mysql2
  const ALLOWED = new Set([
    'host',
    'port',
    'user',
    'password',
    'database',
    'waitForConnections',
    'connectionLimit',
    'queueLimit',
    'multipleStatements',
    'connectTimeout',
    'enableKeepAlive',
    'keepAliveInitialDelay',
    'charset',
    'timezone',
    'supportBigNumbers',
    'bigNumberStrings',
    'dateStrings',
    'decimalNumbers',
    'namedPlaceholders',
    'ssl',
  ]);

  const sanitized = { ...DEFAULTS };

  // מיפוי timeout הישן ל-connectTimeout, אם קיים
  if (cfg.timeout && !cfg.connectTimeout) {
    sanitized.connectTimeout = Number(cfg.timeout) || 10000;
    console.warn(
      'config.database.timeout אינו נתמך ב-mysql2; ממופה ל-connectTimeout.'
    );
  }

  // העתקה רק של מפתחות מותרים
  const unknownKeys = [];
  for (const [key, val] of Object.entries(cfg)) {
    if (!ALLOWED.has(key)) {
      // נתקלת במפתחות בעייתיים? נדווח ונדלג
      if (['acquireTimeout', 'reconnect', 'timeout'].includes(key)) {
        // כבר טיפלנו ב-timeout למעלה; השאר פשוט מתעלמים
        unknownKeys.push(key);
      } else {
        unknownKeys.push(key);
      }
      continue;
    }
    sanitized[key] = val;
  }

  // המרות טיפוס נוחות
  if (sanitized.port != null) sanitized.port = Number(sanitized.port);
  if (sanitized.connectionLimit != null)
    sanitized.connectionLimit = Number(sanitized.connectionLimit);
  if (sanitized.queueLimit != null) sanitized.queueLimit = Number(sanitized.queueLimit);
  if (sanitized.connectTimeout != null)
    sanitized.connectTimeout = Number(sanitized.connectTimeout);

  if (unknownKeys.length) {
    console.warn(
      `Ignoring unsupported DB options: ${unknownKeys.join(', ')}`
    );
  }

  return sanitized;
}

async function createPool() {
  if (pool) return pool;
  if (creatingPromise) return creatingPromise;

  // מסנן את config.database כדי לא להעביר אופציות לא תקינות ל-mysql2
  const poolConfig = sanitizeDbConfig(config.database || {});

  creatingPromise = (async () => {
    try {
      pool = mysql.createPool(poolConfig);

      // בדיקת חיבור זריזה
      const [rows] = await pool.query('SELECT 1 AS ok');
      if (rows[0]?.ok !== 1) throw new Error('DB sanity check failed');

      console.log('✅ DB pool ready');
      return pool;
    } catch (err) {
      // במקרה של כשלון, ננקה מצב ביניים
      if (pool) {
        try { await pool.end(); } catch (_) {}
        pool = undefined;
      }
      creatingPromise = undefined;
      throw err;
    } finally {
      // אם הצליח – נשאיר את creatingPromise עד שיחזור ה-pool;
      // אם נכשל – איפוס נעשה ב-catch
    }
  })();

  return creatingPromise;
}

function getPool() {
  if (!pool) throw new Error('DB pool not initialized. Call createPool() first.');
  return pool;
}

// מומלץ להשתמש ב-execute כדי ליהנות מ-Prepared Statements
async function execute(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

// לשאילתות ללא פרמטרים/או כשלא צריך prepared
async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function close() {
  if (creatingPromise) {
    // אם ברגע זה נבנה ה-pool, נחכה שיסתיים לפני סגירה
    try { await creatingPromise; } catch (_) {}
  }
  if (pool) {
    await pool.end();
    pool = undefined;
    console.log('✅ DB pool closed');
  }
}

module.exports = { createPool, getPool, execute, query, close };
