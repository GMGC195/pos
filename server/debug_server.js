const pool = require('./db');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/categories', async (req, res) => {
  try {
    console.log('Fetching categories...');
    const result = await pool.query('SELECT * FROM categories ORDER BY id');
    console.log('Categories fetched:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error in /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(5001, () => {
  console.log('Debug server running on 5001');
});
