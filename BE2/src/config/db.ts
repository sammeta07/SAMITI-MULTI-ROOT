import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'samiti',
  ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
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
