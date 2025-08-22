// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config();
const db = require('./database'); // ודאי שיש database.js כפי שנשלח

const app = express();

// --- Security & middleware ---
app.use(helmet());

// CORS: אם ALLOWED_ORIGINS ריק -> לאפשר לכולם; אחרת להגביל לרשימה
const allowList = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowList.length === 0 || allowList.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// --- Tiny in-memory session store (dev/demo) ---
const SESS_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const SESS_TTL_MS = (parseInt(process.env.SESSION_TTL_HOURS || '24', 10)) * 3600 * 1000;
const SESS_SAMESITE = process.env.SESSION_SAMESITE || 'Lax'; // 'Lax' | 'Strict' | 'None'
const SESS_SECURE = (process.env.SESSION_SECURE || 'false') === 'true';

const sessions = new Map(); // sid -> { userId, createdAt }

function createSession(res, userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { userId, createdAt: Date.now() });
  res.cookie(SESS_NAME, sid, {
    httpOnly: true,
    sameSite: SESS_SAMESITE,
    secure: SESS_SECURE,
    maxAge: SESS_TTL_MS,
  });
}

function getSession(req) {
  const sid = req.cookies?.[SESS_NAME];
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESS_TTL_MS) {
    sessions.delete(sid);
    return null;
  }
  return { sid, ...s };
}

function destroySession(res, sid) {
  if (sid) sessions.delete(sid);
  res.clearCookie(SESS_NAME, { httpOnly: true, sameSite: SESS_SAMESITE, secure: SESS_SECURE });
}

// --- Health endpoints ---
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Users Service is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/db', async (_req, res) => {
  try {
    await db.getPool();
    const rows = await db.query('SELECT 1 AS ok');
    const ok = rows[0]?.ok === 1;
    res.json({ success: ok, db: ok ? 'up' : 'down' });
  } catch (e) {
    res.status(500).json({ success: false, db: 'down', error: e.message });
  }
});

// --- Minimal user flows ---

// רישום משתמש חדש
// רישום משתמש חדש — חובה: username, password, email
app.post('/register', async (req, res) => {
  const { username, password, email, full_name } = req.body || {};

  if (!username || !password || !email) {
    return res.status(400).json({ success: false, message: 'username, password and email are required' });
  }

  const uname = String(username).trim();
  const emailLower = String(email).toLowerCase().trim();

  // ולידציה בסיסית
  if (!/^[a-zA-Z0-9._-]{3,100}$/.test(uname)) {
    return res.status(400).json({ success: false, message: 'invalid username (3-100 chars, letters/digits/._-)' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(emailLower)) {
    return res.status(400).json({ success: false, message: 'invalid email' });
  }

  try {
    // ייחודיות
    const [uTaken] = await db.query('SELECT 1 FROM `users` WHERE `username` = ? LIMIT 1', [uname]);
    if (uTaken) return res.status(409).json({ success: false, message: 'Username already taken' });

    const [eTaken] = await db.query('SELECT 1 FROM `users` WHERE `email` = ? LIMIT 1', [emailLower]);
    if (eTaken) return res.status(409).json({ success: false, message: 'Email already registered' });

    // הוספה
    const result = await db.query(
      'INSERT INTO `users` (`username`,`password`,`email`,`full_name`) VALUES (?,?,?,?)',
      [uname, password, emailLower, full_name || null]
    );

    return res.status(201).json({ success: true, user_id: result.insertId, username: uname });
  } catch (e) {
    console.error('REGISTER error:', {
      code: e.code, errno: e.errno, sqlState: e.sqlState,
      message: e.sqlMessage || e.message, sql: e.sql
    });

    if (e.code === 'ER_DUP_ENTRY') {
      const field = /username/i.test(e.sqlMessage) ? 'Username'
                 : /email/i.test(e.sqlMessage)    ? 'Email'
                 : 'Value';
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    return res.status(500).json({ success: false, message: e.sqlMessage || e.message || 'DB error' });
  }
});



// כניסה למשתמש קיים (יוצר סשן-קוקי)
// כניסה למשתמש קיים — מקבל רק username + password (שניהם חובה)
app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'username and password are required'
    });
  }

  try {
    const uname = String(username).trim();

    // שליפה לפי username בלבד
    const sql = 'SELECT `id`,`email`,`username`,`full_name`,`password` AS `pwd` FROM `users` WHERE `username` = ? LIMIT 1';
    const rows = await db.query(sql, [uname]);

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    if (user.pwd !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    createSession(res, user.id);
    delete user.pwd;
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ success: false, message: 'DB error', error: e.message });
  }
});



// התנתקות (מוחק סשן וקוקי)
app.post('/logout', (req, res) => {
  const s = getSession(req);
  if (s) destroySession(res, s.sid);
  else destroySession(res, null);
  res.json({ success: true });
});

// שליפת מייל לפי מזהה
app.get('/users/:id/email', async (req, res) => {
  try {
    const rows = await db.query('SELECT email FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, email: rows[0].email });
  } catch (e) {
    res.status(500).json({ success: false, message: 'DB error', error: e.message });
  }
});

// 404 לכל השאר
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl });
});

const dashboardRoutes = require('./routes/dashboard');
app.use('/dashboard', dashboardRoutes);

// --- Start server ---
const PORT = parseInt(process.env.PORT || '3000', 10);

(async () => {
  try {
    await db.getPool();
    app.listen(PORT, () => console.log(`Users Service listening on :${PORT}`));
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => { await db.close(); process.exit(0); });
process.on('SIGINT', async () => { await db.close(); process.exit(0); });
