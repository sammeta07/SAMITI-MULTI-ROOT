import mysql from 'mysql2/promise';
import { getMysqlConfig } from './config/mysql';

const dbConfig = getMysqlConfig();

async function getSchemaInfo() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Get all tables
    const [tables]: any = await connection.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? 
      ORDER BY TABLE_NAME
    `, [dbConfig.database]);
    
    console.log('\n========== DATABASE SCHEMA ==========\n');
    
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      
      // Get columns for each table
      const [columns]: any = await connection.execute(`
        SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [dbConfig.database, tableName]);
      
      console.log(`\n📋 TABLE: ${tableName}`);
      console.log('─'.repeat(80));
      
      for (const col of columns) {
        const nullable = col.IS_NULLABLE === 'YES' ? '✓' : '✗';
        const key = col.COLUMN_KEY ? `[${col.COLUMN_KEY}]` : '';
        const extra = col.EXTRA ? `(${col.EXTRA})` : '';
        
        console.log(`  • ${col.COLUMN_NAME.padEnd(20)} | ${col.COLUMN_TYPE.padEnd(20)} | NULL: ${nullable} ${key} ${extra}`);
      }
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
  } finally {
    await connection.end();
  }
}

getSchemaInfo().catch(console.error);
