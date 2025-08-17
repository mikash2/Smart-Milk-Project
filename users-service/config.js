require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'appuser',
    password: process.env.DB_PASS || 'apppass',
    database: process.env.DB_NAME || 'users_db',
    // אלה נתמכים ב-mysql2:
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,     // במקום timeout
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    multipleStatements: false, // אבטחה
    dateStrings: true,       // להחזיר DATETIME כמחרוזות
    decimalNumbers: true,    // להמיר DECIMAL למספרים
  },
  server: {
    port: Number(process.env.PORT || 3000),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
  }
};
