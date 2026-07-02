import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { getMysqlConfig } from './src/config/mysql';

dotenv.config();

async function checkUsersTable() {
  try {
    const connection = await mysql.createConnection(getMysqlConfig());

    console.log('✅ Connected to MySQL');
    
    const [rows] = await connection.execute('DESCRIBE users');
    console.log('\n📋 Users Table Structure:');
    console.table(rows);

    const [events] = await connection.execute('DESCRIBE events');
    console.log('\n📋 Events Table Structure (After Migration):');
    console.table(events);

    await connection.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUsersTable();
