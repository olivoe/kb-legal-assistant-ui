#!/usr/bin/env node
/**
 * Initialize Vercel Postgres database schema
 * Run this script once to set up the chat_sessions table
 * 
 * Usage: node scripts/init-db.js
 */

const { sql } = require('@vercel/postgres');
const fs = require('fs').promises;
const path = require('path');

async function initDatabase() {
  try {
    console.log('🗄️  Initializing Vercel Postgres database...');
    
    // Check connection
    const testResult = await sql`SELECT NOW()`;
    console.log('✅ Database connection successful');
    console.log(`   Server time: ${testResult.rows[0].now}`);
    
    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'lib', 'db', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    
    console.log('\n📝 Executing schema...');
    
    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      try {
        await sql.query(statement);
        console.log(`   ✓ Executed: ${statement.split('\n')[0].substring(0, 60)}...`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   ⊙ Skipped (already exists): ${statement.split('\n')[0].substring(0, 40)}...`);
        } else {
          throw err;
        }
      }
    }
    
    // Verify table creation
    const checkResult = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'chat_sessions'
      ) as table_exists;
    `;
    
    if (checkResult.rows[0].table_exists) {
      console.log('\n✅ Database initialized successfully!');
      console.log('   Table "chat_sessions" is ready');
      
      // Show table info
      const countResult = await sql`SELECT COUNT(*) as count FROM chat_sessions`;
      console.log(`   Current records: ${countResult.rows[0].count}`);
    } else {
      console.log('\n❌ Table creation failed - table does not exist');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Failed to initialize database:', error.message);
    console.error('\nMake sure you have:');
    console.error('1. Created a Postgres database in Vercel dashboard');
    console.error('2. Set the POSTGRES_URL environment variable in .env.local');
    console.error('3. Or set all individual POSTGRES_* variables');
    process.exit(1);
  } finally {
    // Close the connection pool
    await sql.end();
    process.exit(0);
  }
}

initDatabase();

