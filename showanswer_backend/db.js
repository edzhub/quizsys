const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'showanswer'}`;

const pool = new Pool({
  connectionString,
});

async function initDb() {
  const client = await pool.connect();
  try {
    console.log('[Database] Connected to PostgreSQL. Initializing tables...');

    // 1. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(50) PRIMARY KEY,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL
      );
    `);

    // 2. Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(255) PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        role VARCHAR(50) NOT NULL
      );
    `);

    // 3. Create otps table
    await client.query(`
      CREATE TABLE IF NOT EXISTS otps (
        username VARCHAR(50) PRIMARY KEY,
        otp VARCHAR(50) NOT NULL,
        expires DOUBLE PRECISION NOT NULL
      );
    `);

    // 4. Create students table
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        marker_id INTEGER,
        student_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        class VARCHAR(50),
        section VARCHAR(50)
      );
    `);

    // 5. Create responses table (volatile scanner overlay responses)
    await client.query(`
      CREATE TABLE IF NOT EXISTS responses (
        student_id VARCHAR(50) PRIMARY KEY,
        answer VARCHAR(50) NOT NULL
      );
    `);

    // 6. Create quiz_questions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        quiz_id VARCHAR(50),
        q_index INTEGER,
        question TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer VARCHAR(50),
        PRIMARY KEY (quiz_id, q_index)
      );
    `);

    // 7. Create quiz_responses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_responses (
        quiz_id VARCHAR(50),
        q_index INTEGER,
        student_id VARCHAR(50),
        answer VARCHAR(50),
        PRIMARY KEY (quiz_id, q_index, student_id)
      );
    `);

    // 8. Create scan_batches table for temporary scan queue
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_batches (
        batch_id SERIAL PRIMARY KEY,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Create scan_pages table to store queued page images
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_pages (
        page_id SERIAL PRIMARY KEY,
        batch_id INTEGER REFERENCES scan_batches(batch_id) ON DELETE CASCADE,
        student_index INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default users
    await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ('admin', 'admin123', 'Admin')
      ON CONFLICT (username) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ('teacher', 'teacher123', 'Teacher')
      ON CONFLICT (username) DO NOTHING;
    `);

    console.log('[Database] Database tables initialized successfully.');
  } catch (err) {
    console.error('[Database] Error initializing database tables:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDb,
  query: (text, params) => pool.query(text, params),
};
