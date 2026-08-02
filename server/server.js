require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

// Database initialization (reloaded)
(async () => {
  try {
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_order_id UUID UNIQUE');
    
    // Create employees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        role VARCHAR(50),
        salary NUMERIC(10, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Drop email and phone columns if they exist
    await pool.query('ALTER TABLE employees DROP COLUMN IF EXISTS email CASCADE');
    await pool.query('ALTER TABLE employees DROP COLUMN IF EXISTS phone CASCADE');
    
    // Add shift column if not exists
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift VARCHAR(20) DEFAULT 'R1'
    `);
    
    // Add shift_hours column if not exists
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_hours NUMERIC(4, 2) DEFAULT 12.0
    `);

    // Add employee_id column if not exists
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50) UNIQUE
    `);

    // Add department column if not exists
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100)
    `);

    // Add position column if not exists
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS position VARCHAR(100)
    `);

    // Backfill existing employees without an employee_id
    await pool.query(`
      UPDATE employees SET employee_id = 'EMP-' || LPAD(id::text, 4, '0') WHERE employee_id IS NULL
    `);
    
    // Create employee_attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_attendance (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        check_in TIMESTAMPTZ NOT NULL,
        check_out TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'Present',
        on_break BOOLEAN DEFAULT FALSE,
        break_start TIMESTAMPTZ,
        total_break_duration_seconds INTEGER DEFAULT 0,
        date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_employee ON employee_attendance(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON employee_attendance(date)`);

    // Ensure all stock alert columns exist
    await pool.query('ALTER TABLE stock ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10,3) DEFAULT 0');
    await pool.query('ALTER TABLE stock ADD COLUMN IF NOT EXISTS low_stock_at TIMESTAMP');
    await pool.query('ALTER TABLE stock ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN DEFAULT FALSE');
    
    // Fix any historically negative stock quantities
    await pool.query('UPDATE stock SET quantity = 0 WHERE quantity < 0');
    await pool.query('UPDATE stock_history SET remaining_quantity = 0 WHERE remaining_quantity < 0');

    // Add non-negative constraints if they don't already exist
    await pool.query(`
      DO $$ BEGIN
        BEGIN ALTER TABLE stock ADD CONSTRAINT stock_quantity_non_negative CHECK (quantity >= 0);
        EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TABLE stock_history ADD CONSTRAINT stock_history_remaining_non_negative CHECK (remaining_quantity >= 0);
        EXCEPTION WHEN duplicate_object THEN NULL; END;
      END $$;
    `);

    // Per-size recipe support: add size_label column and update unique constraint
    await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS size_label VARCHAR(50)');
    await pool.query(`
      DO $$ BEGIN
        -- Drop old unique constraint on (item_id, stock_id) if still exists
        BEGIN ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_item_id_stock_id_key;
        EXCEPTION WHEN OTHERS THEN NULL; END;
        -- Create new unique index treating NULL size_label as '' (all sizes)
        BEGIN
          CREATE UNIQUE INDEX recipes_item_stock_size_unique
          ON recipes (item_id, stock_id, COALESCE(size_label, ''));
        EXCEPTION WHEN duplicate_table THEN NULL; END;
      END $$;
    `);

    console.log('✅ Database schema verified: all columns and constraints up to date.');
  } catch (err) {
    console.warn('⚠️ Database schema verification warning:', err.message);
  }
})();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — allowed origins (add your deployed frontend URLs here)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  // Vercel deployments
  'https://ddnjj.vercel.app',
  'https://1-mu-pink.vercel.app',
  // Allow any Vercel preview URLs for this project
  /https:\/\/.*\.vercel\.app$/,
  // Custom FRONTEND_URL from env (if set)
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = ALLOWED_ORIGINS.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Handle preflight for all routes
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/items', require('./routes/items'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/support', require('./routes/support'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🍕 Pizza Shop Server running on http://localhost:${PORT}`);
});
