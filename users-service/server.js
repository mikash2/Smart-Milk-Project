// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config();
const db = require('./database/connection');
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

app.locals.createSession  = createSession;
app.locals.getSession     = getSession;
app.locals.destroySession = destroySession;

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
    await db.createPool(); 
    const rows = await db.query('SELECT 1 AS ok');
    const ok = rows[0]?.ok === 1;
    res.json({ success: ok, db: ok ? 'up' : 'down' });
  } catch (e) {
    res.status(500).json({ success: false, db: 'down', error: e.message });
  }
});

// --- Routes ---
const usersRoutes = require('./routes/users');
app.use('/users', usersRoutes);

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const dashboardRoutes = require('./routes/dashboard');
app.use('/dashboard', dashboardRoutes);

// 404 לכל השאר
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl });
});

// --- Start server ---
const PORT = parseInt(process.env.PORT || '3000', 10);

(async () => {
  try {
    await db.createPool();
    app.listen(PORT, () => console.log(`Users Service listening on :${PORT}`));
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => { await db.close(); process.exit(0); });
process.on('SIGINT', async () => { await db.close(); process.exit(0); });
