export const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'samiti',
  ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

export interface DbOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: object;
}
