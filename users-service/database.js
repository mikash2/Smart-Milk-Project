const mysql = require('mysql2/promise');
require('dotenv').config();


let pool;


async function getPool() {
if (pool) return pool;
const {
DB_HOST, DB_PORT = '3306', DB_NAME, DB_USER, DB_PASS,
DB_CONN_LIMIT = '10', DB_WAIT_FOR_CONNECTIONS = 'true', DB_QUEUE_LIMIT = '0'
} = process.env;


if (!DB_HOST || !DB_NAME || !DB_USER) {
throw new Error('Missing DB env vars: DB_HOST, DB_NAME, DB_USER');
}


pool = mysql.createPool({
host: DB_HOST,
port: Number(DB_PORT),
database: DB_NAME,
user: DB_USER,
password: DB_PASS,
waitForConnections: DB_WAIT_FOR_CONNECTIONS === 'true',
connectionLimit: Number(DB_CONN_LIMIT),
queueLimit: Number(DB_QUEUE_LIMIT),
timezone: 'Z',
enableKeepAlive: true,
keepAliveInitialDelay: 10000,
dateStrings: true,
});


return pool;
}


async function query(sql, params) {
const p = await getPool();
const [rows] = await p.execute(sql, params);
return rows;
}


async function close() {
if (pool) { await pool.end(); pool = null; }
}


module.exports = { getPool, query, close };