import mysql, { RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkSchema() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'root',
      database: process.env.MYSQL_DATABASE || 'samiti'
    });

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
