// lib/db/init.ts
// Database initialization and migration utilities
import { sql } from '@vercel/postgres';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Initialize the database schema
 * This should be run once to create the tables
 */
export async function initDatabase(): Promise<void> {
  try {
    console.log('🗄️  Initializing database schema...');
    
    const schemaPath = path.join(process.cwd(), 'lib', 'db', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    
    // Execute the schema SQL
    await sql.query(schema);
    
    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Check if the chat_sessions table exists
 */
export async function checkDatabaseReady(): Promise<boolean> {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'chat_sessions'
      ) as table_exists;
    `;
    
    return result.rows[0]?.table_exists === true;
  } catch (error) {
    console.error('Failed to check database status:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  totalRecords: number;
  tableSizeMB: number;
  oldestRecord: string | null;
  newestRecord: string | null;
}> {
  try {
    const countResult = await sql`SELECT COUNT(*) as count FROM chat_sessions`;
    const sizeResult = await sql`
      SELECT pg_size_pretty(pg_total_relation_size('chat_sessions')) as size
    `;
    const rangeResult = await sql`
      SELECT 
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest
      FROM chat_sessions
    `;
    
    return {
      totalRecords: parseInt(countResult.rows[0]?.count || '0'),
      tableSizeMB: sizeResult.rows[0]?.size || '0',
      oldestRecord: rangeResult.rows[0]?.oldest || null,
      newestRecord: rangeResult.rows[0]?.newest || null,
    };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return {
      totalRecords: 0,
      tableSizeMB: 0,
      oldestRecord: null,
      newestRecord: null,
    };
  }
}

