export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and set your MySQL credentials before starting the backend.`
    );
  }

  return value;
}

export function getMysqlConfig(): MysqlConfig {
  return {
    host: requireEnv('MYSQL_HOST'),
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER?.trim() || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: requireEnv('MYSQL_DATABASE'),
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  };
}