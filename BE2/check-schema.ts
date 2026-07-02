import mysql, { RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';
import { getMysqlConfig } from './src/config/mysql';

dotenv.config();

async function checkSchema() {
  try {
    const connection = await mysql.createConnection(getMysqlConfig());

    console.log('✅ Connected to MySQL');
    
    const [committeeMembersSchema] = await connection.execute<RowDataPacket[]>('DESCRIBE committee_members');
    console.log('\n📋 committee_members Table Structure:');
    console.table(committeeMembersSchema);

    const [committeeAdmins] = await connection.execute<RowDataPacket[]>(`
      SELECT * FROM committee_members WHERE is_committee_admin = 1 LIMIT 3
    `);
    console.log('\n👤 Sample Committee Admins:');
    console.table(committeeAdmins);

    const [eventsData] = await connection.execute<RowDataPacket[]>('SELECT * FROM events LIMIT 1');
    console.log('\n📅 Events in database:', eventsData.length);

    await connection.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
