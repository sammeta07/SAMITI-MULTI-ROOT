import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { getMysqlConfig } from './src/config/mysql';

dotenv.config();

async function fixMigration() {
  try {
    const connection = await mysql.createConnection(getMysqlConfig());

    console.log('✅ Connected to MySQL');

    const statements = [
      // Remove description columns from legacy tables if present
      `ALTER TABLE committees DROP COLUMN description`,
      `ALTER TABLE events DROP COLUMN description`,
      `ALTER TABLE programs DROP COLUMN description`,
      
      // Add foreign key constraints with correct user table primary key (id, not user_id)
      `ALTER TABLE events ADD CONSTRAINT fk_events_committee FOREIGN KEY (committee_id) REFERENCES committees(committee_id) ON DELETE CASCADE`,
      `ALTER TABLE events ADD CONSTRAINT fk_events_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT`,
      `ALTER TABLE events ADD CONSTRAINT fk_events_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL`
    ];

    for (const statement of statements) {
      console.log(`\n📝 Executing: ${statement.substring(0, 80)}...`);
      try {
        await connection.execute(statement);
        console.log('✅ Query executed successfully');
      } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log('⚠️  Column already exists (skipping)');
        } else if (error.code === 'ER_DUP_KEYNAME') {
          console.log('⚠️  Constraint already exists (skipping)');
        } else if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY' || error.code === 'ER_BAD_FIELD_ERROR') {
          console.log('⚠️  Column not present (skipping)');
        } else {
          console.log(`⚠️  Error: ${error.code} - ${error.message}`);
        }
      }
    }

    await connection.end();
    console.log('\n🎉 Post-migration fixes completed!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixMigration();
