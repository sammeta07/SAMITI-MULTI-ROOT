import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getMysqlConfig } from './src/config/mysql';

// Load environment variables
dotenv.config();

async function executeSqlStatementsFromFile(connection: mysql.Connection, migrationFilePath: string): Promise<void> {
  const sql = fs.readFileSync(migrationFilePath, 'utf-8');
  const sqlWithoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = sqlWithoutComments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    console.log(`\n📝 Executing: ${statement.substring(0, 100)}...`);
    try {
      await connection.execute(statement);
      console.log('✅ Query executed successfully');
    } catch (error: any) {
      const safeErrorCodes = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_FK_DUP_NAME', 'ER_DUP_CONSTRAINT', 'ER_CANT_DROP_FIELD_OR_KEY', 'ER_BAD_FIELD_ERROR'];
      const duplicateCheckConstraintMessage = typeof error?.message === 'string' && error.message.includes('Duplicate check constraint name');
      const missingCheckConstraintMessage = typeof error?.message === 'string' && error.message.includes('Check constraint') && error.message.includes('is not found in the table');
      const legacyForeignKeyMessage = typeof error?.message === 'string' && error.message.includes('Missing column') && error.message.includes('foreign key constraint');
      if (safeErrorCodes.includes(error.code) || duplicateCheckConstraintMessage || missingCheckConstraintMessage || legacyForeignKeyMessage) {
        console.log(`⚠️  ${error.code}: ${error.message} (skipping)`);
      } else {
        throw error;
      }
    }
  }
}

async function runMigration() {
  try {
    const connection = await mysql.createConnection(getMysqlConfig());

    console.log('✅ Connected to MySQL database');

    const migrationDirectoryPath = path.join(process.cwd(), 'src/migrations');
    const migrationFiles = fs
      .readdirSync(migrationDirectoryPath)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort((leftFileName, rightFileName) => leftFileName.localeCompare(rightFileName));

    if (!migrationFiles.length) {
      console.log('ℹ️ No migration files found under src/migrations');
    }

    for (const migrationFile of migrationFiles) {
      const migrationFilePath = path.join(migrationDirectoryPath, migrationFile);
      console.log(`\n📦 Running migration file: ${migrationFile}`);
      await executeSqlStatementsFromFile(connection, migrationFilePath);
    }

    await connection.end();
    console.log('\n🎉 Migration completed successfully!');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
