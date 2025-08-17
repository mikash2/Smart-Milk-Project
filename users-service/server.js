const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const db = require('./database/connection');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

// Create Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowed = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
app.use(cors({
  origin: (origin, cb) => {
    // מאפשר מהמכונה המקומית/פוסטמן (origin=null), או מכל מקור אם לא הוגדרו מקורות,
    // או רק מהמקורות שהוגדרו ב-ALLOWED_ORIGINS
    if (!origin || allowed.size === 0 || allowed.has(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (config.server.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Users Service is running',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
    version: '1.0.0'
  });
});

app.get('/health/db', async (_req, res) => {
  try {
    await db.createPool();
    const rows = await db.query('SELECT 1 AS ok');
    res.json({ success: rows[0]?.ok === 1, db: rows[0]?.ok === 1 ? 'up' : 'down' });
  } catch (e) {
    res.status(500).json({ success: false, db: 'down', error: e.message });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // Handle database connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return res.status(503).json({
      success: false,
      message: 'Database service unavailable',
      error: 'Database connection failed'
    });
  }
  
  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: error.message
    });
  }
  
  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: 'Token verification failed'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      error: 'Token has expired'
    });
  }
  
  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    message: config.server.nodeEnv === 'development' ? message : 'Internal server error',
    ...(config.server.nodeEnv === 'development' && { error: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await db.close();
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Initialize database connection
    await db.createPool();
    
    // Start listening
    const server = app.listen(config.server.port, () => {
      console.log(`🚀 Users Service started successfully!`);
      console.log(`📍 Server running on port ${config.server.port}`);
      console.log(`🌍 Environment: ${config.server.nodeEnv}`);
      console.log(`🔗 Health check: http://localhost:${config.server.port}/health`);
      console.log(`📚 API Documentation: http://localhost:${config.server.port}/api`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${config.server.port} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
        process.exit(1);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
