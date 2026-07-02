import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and set your MySQL credentials before starting the backend.`
    );
  }

  return value;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: requireEnv('MYSQL_HOST'),
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER?.trim() || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: requireEnv('MYSQL_DATABASE'),
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

export async function query<T extends RowDataPacket[]>(sql: string, params?: any[]): Promise<T> {
  const pool = getPool();
  const [rows] = await pool.query<T>(sql, params);
  return rows;
}

export async function execute(sql: string, params?: any[]): Promise<ResultSetHeader> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

export async function getConnection(): Promise<PoolConnection> {
  const pool = getPool();
  return pool.getConnection();
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
