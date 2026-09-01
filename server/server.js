require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Handle unexpected errors (like Neon DB ECONNRESET on idle clients) to prevent app crash
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

const pool = require('./db');

// Database initialization (reloaded)
const runWithStartupRetry = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      const isTransient = err.message?.includes('Connection terminated') ||
                          err.message?.includes('timeout') ||
                          err.code === 'ECONNRESET';
      if (isTransient && i < maxRetries - 1) {
        const delay = 2000 * (i + 1);
        console.warn(`⚠️ Database schema verification warning: ${err.message} — retrying in ${delay/1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.warn('⚠️ Database schema verification warning:', err.message);
        return;
      }
    }
  }
};

(async () => {
  await runWithStartupRetry(async () => {
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
    
    // Rename shift column to working_hours if it exists
    try {
      await pool.query('ALTER TABLE employees RENAME COLUMN shift TO working_hours');
    } catch (e) {}

    // Add working_hours column if not exists (in case it didn't exist before)
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS working_hours VARCHAR(20) DEFAULT 'R1'
    `);
    
    // Add shift_hours column if not exists
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_hours NUMERIC(4, 2) DEFAULT 12.0
    `);

    // Add branch column
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch VARCHAR(100)
    `);

    // Add new shift column
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift VARCHAR(50) DEFAULT 'Day'
    `);

    // Add strict_attendance column
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS strict_attendance BOOLEAN DEFAULT false
    `);

    // Add custom deduction columns
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_deduction_active BOOLEAN DEFAULT false
    `);
    
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_deduction_rules JSONB DEFAULT '[]'::jsonb
    `);

    // Rename employee_shifts to employee_working_hours if it exists
    try {
      await pool.query('ALTER TABLE employee_shifts RENAME TO employee_working_hours');
    } catch (e) {}

    // Create employee_working_hours config table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_working_hours (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        start_time VARCHAR(20) NOT NULL DEFAULT '10:00',
        end_time VARCHAR(20) NOT NULL DEFAULT '23:00',
        hours NUMERIC(4, 2) NOT NULL DEFAULT 13.0,
        is_split_shift BOOLEAN DEFAULT false,
        start_time_2 VARCHAR(20),
        end_time_2 VARCHAR(20)
      )
    `);

    // Ensure new split shift columns exist on employee_working_hours
    try {
      await pool.query('ALTER TABLE employee_working_hours ADD COLUMN is_split_shift BOOLEAN DEFAULT false');
      await pool.query('ALTER TABLE employee_working_hours ADD COLUMN start_time_2 VARCHAR(20)');
      await pool.query('ALTER TABLE employee_working_hours ADD COLUMN end_time_2 VARCHAR(20)');
    } catch (e) {
      // Columns likely already exist
    }

    // NOTE: No default seed for working hours - entries are created per employee only
    // Cleanup: remove working hour records that don't match any real employee (e.g. R1, R2, R3 legacy seeds)
    try {
      await pool.query(`
        DELETE FROM employee_working_hours wh
        WHERE NOT EXISTS (
          SELECT 1 FROM employees e WHERE LOWER(e.name) = LOWER(wh.name)
        )
      `);
    } catch (e) {
      console.log('Cleanup skipped:', e.message);
    }

    // Convert existing shifts to 24-hour format
    const shiftsRes = await pool.query('SELECT id, start_time, end_time FROM employee_working_hours');
    for (const row of shiftsRes.rows) {
      const convertTo24 = (timeStr) => {
        if (!timeStr) return timeStr;
        const match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
        if (match) {
          let hrs = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          const ampm = match[3].toUpperCase();
          if (ampm === 'PM' && hrs < 12) hrs += 12;
          if (ampm === 'AM' && hrs === 12) hrs = 0;
          return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        }
        return timeStr;
      };
      const newStart = convertTo24(row.start_time);
      const newEnd = convertTo24(row.end_time);
      if (newStart !== row.start_time || newEnd !== row.end_time) {
        await pool.query('UPDATE employee_working_hours SET start_time = $1, end_time = $2 WHERE id = $3', [newStart, newEnd, row.id]);
        console.log(`Migrated shift ${row.id} time to 24h format.`);
      }
    }

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
    
    // Create employee_attendance table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_attendance (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        check_in TIMESTAMPTZ,
        check_out TIMESTAMPTZ,
        status VARCHAR(50) DEFAULT 'Present',
        notes TEXT,
        is_paid BOOLEAN DEFAULT true,
        date DATE DEFAULT CURRENT_DATE,
        on_break BOOLEAN DEFAULT false,
        break_start TIMESTAMPTZ,
        total_break_duration_seconds INTEGER DEFAULT 0,
        shift_name VARCHAR(50),
        shift_hours NUMERIC(4, 2),
        shift_start_time VARCHAR(20),
        shift_end_time VARCHAR(20),
        is_split_shift BOOLEAN DEFAULT false,
        shift_start_time_2 VARCHAR(20),
        shift_end_time_2 VARCHAR(20),
        created_by VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Ensure new split shift columns exist on employee_attendance
    try {
      await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS is_split_shift BOOLEAN DEFAULT false');
      await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_start_time_2 VARCHAR(20)');
      await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_end_time_2 VARCHAR(20)');
      // Add edit_count for orders
      await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0');
    } catch (e) {
      // Columns likely already exist
    }

    // Create edited_attendance table for audit logging
    await pool.query(`
      CREATE TABLE IF NOT EXISTS edited_attendance (
        id SERIAL PRIMARY KEY,
        attendance_id INTEGER REFERENCES employee_attendance(id) ON DELETE CASCADE,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        original_check_in TIMESTAMPTZ,
        original_check_out TIMESTAMPTZ,
        new_check_in TIMESTAMPTZ,
        new_check_out TIMESTAMPTZ,
        edited_by VARCHAR(150),
        reason TEXT,
        edited_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create attendance_edit_requests table for employee requested changes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_edit_requests (
        id SERIAL PRIMARY KEY,
        attendance_id INTEGER REFERENCES employee_attendance(id) ON DELETE CASCADE,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        requested_by_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        target_role VARCHAR(20) NOT NULL,
        requested_check_in TIMESTAMPTZ,
        requested_check_out TIMESTAMPTZ,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        request_type VARCHAR(20) DEFAULT 'Edit'
      )
    `);
    
    // Ensure request_type column exists if table was already created
    await pool.query('ALTER TABLE attendance_edit_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT \'Edit\'');

    // Ensure employee_attendance has remarks column
    await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS remarks VARCHAR(100)');
    // Add shift tracking columns
    await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_name VARCHAR(50)');
    await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_hours NUMERIC(4, 2)');
    await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_start_time VARCHAR(20)');
    await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_end_time VARCHAR(20)');

    // Migrate existing records: fetch employee's current shift details and populate historical attendance
    await pool.query(`
      UPDATE employee_attendance ea
      SET 
        shift_name = e.working_hours,
        shift_hours = COALESCE(e.shift_hours, 12.0),
        shift_start_time = es.start_time,
        shift_end_time = es.end_time
      FROM employees e
      LEFT JOIN employee_working_hours es ON e.working_hours = es.name
      WHERE ea.employee_id = e.id AND ea.shift_name IS NULL
    `);
    // Ensure employee_attendance has created_by column
    await pool.query('ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS created_by VARCHAR(150)');
    // Ensure users has shift and branch column
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS shift VARCHAR(50)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(100)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE');

    // Migration: Auto-create user accounts for existing employees
    const employeesRes = await pool.query('SELECT * FROM employees');
    const bcrypt = require('bcrypt');
    for (const emp of employeesRes.rows) {
      const empId = emp.id;
      const employeeCode = emp.employee_id || `EMP-${String(empId).padStart(4, '0')}`;
      const userCheck = await pool.query(
        'SELECT * FROM users WHERE employee_id = $1',
        [empId]
      );
      if (userCheck.rows.length === 0) {
        let baseUsername = emp.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!baseUsername) {
          baseUsername = `emp${empId}`;
        }
        let username = baseUsername;
        let counter = 1;
        while (true) {
          const checkU = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
          if (checkU.rows.length === 0) {
            break;
          }
          username = `${baseUsername}${counter}`;
          counter++;
        }
        const email = `${username}@alrawaq.com`;
        const passwordHash = await bcrypt.hash('user123', 10);
        await pool.query(
          `INSERT INTO users (username, email, password_hash, role, employee_id, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [username, email, passwordHash, 'Employee', empId, true]
        );
        console.log(`Migrated: Auto-created user account for existing employee: ${emp.name} (${username})`);
      }
    }

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

    // Add payroll schema tables and column updates
    await pool.query(`
      ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT TRUE
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_payroll_settings (
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
        overtime_rate NUMERIC(10, 2),
        base_salary NUMERIC(10, 2),
        allowed_leaves INTEGER
      )
    `);

    // Seed default settings
    await pool.query(`
      INSERT INTO payroll_settings (key, value)
      VALUES 
        ('global_overtime_rate', '150.00'),
        ('allowed_leaves', '2')
      ON CONFLICT (key) DO NOTHING
    `);

    // Create payroll records table to store finalized logs & manual adjustments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_payroll_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        base_salary NUMERIC(10, 2) NOT NULL,
        presents INTEGER DEFAULT 0,
        absents INTEGER DEFAULT 0,
        leaves INTEGER DEFAULT 0,
        holidays INTEGER DEFAULT 0,
        overtime_hours NUMERIC(10, 2) DEFAULT 0,
        overtime_pay NUMERIC(10, 2) DEFAULT 0,
        deductions NUMERIC(10, 2) DEFAULT 0,
        other_adjustments NUMERIC(10, 2) DEFAULT 0,
        net_salary NUMERIC(10, 2) NOT NULL,
        paid_amount NUMERIC(10, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Pending',
        paid_date TIMESTAMPTZ,
        notes TEXT,
        UNIQUE(employee_id, month)
      )
    `);

    // Create tables schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id SERIAL PRIMARY KEY,
        table_number VARCHAR(50) NOT NULL UNIQUE,
        status VARCHAR(20) DEFAULT 'Active',
        available_branches JSONB DEFAULT '["Branch 1", "Branch 2", "Branch 3"]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Pre-fill 1 to 20 tables if the table is completely empty
    const checkTables = await pool.query('SELECT COUNT(*) FROM tables');
    if (parseInt(checkTables.rows[0].count) === 0) {
      for (let i = 1; i <= 20; i++) {
        await pool.query('INSERT INTO tables (table_number) VALUES ($1)', [String(i)]);
      }
      console.log('Migrated: Auto-created default tables 1 to 20');
    }

    console.log('✅ Database schema verified: all columns and constraints up to date.');
  } catch (err) {
    throw err; // Let runWithStartupRetry handle it
  }
  }); // end runWithStartupRetry
})();

const app = express();
const PORT = process.env.PORT || 5000;
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);

// CORS — allowed origins (add your deployed frontend URLs here)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  // Vercel deployments
  'https://ddnjj.vercel.app',
  'https://1-mu-pink.vercel.app',
  'https://alrawaq.vercel.app',
  // Allow any Vercel preview URLs for this project
  /https:\/\/.*\.vercel\.app$/,
  // Custom FRONTEND_URL from env (if set, supports comma-separated values)
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) : []),
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

// Disable caching for all API responses
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = ALLOWED_ORIGINS.some(o =>
        typeof o === 'string' ? o === origin : o.test(origin)
      );
      if (allowed) return callback(null, true);
      callback(new Error(`Socket.io CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Socket.io client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`🔌 Socket.io client disconnected: ${socket.id}`);
  });
});

// Middleware to expose io to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/items', require('./routes/items'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/support', require('./routes/support'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/tables', require('./routes/tables'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

server.listen(PORT, () => {
  console.log(`🍕 Pizza Shop Server running on http://localhost:${PORT}`);
});
