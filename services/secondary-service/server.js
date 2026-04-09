const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'timescaledb',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'appdb',
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'changeme',
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

// AGENT: Replace table name and columns with domain-specific entity from industry.yaml
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS readings (
  id UUID PRIMARY KEY,
  sensor_id TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit',
  region TEXT NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
SELECT create_hypertable('readings', 'recorded_at', if_not_exists => TRUE);
`;

(async () => {
  try {
    await pool.query(INIT_SQL);
    console.log('Database table initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
})();

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'secondary-service' }));

// AGENT: Update endpoint path to match industry entity (e.g., /api/usage)
app.get('/api/readings', async (req, res) => {
  try {
    const cacheKey = 'readings:latest';
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const { rows } = await pool.query(
      'SELECT * FROM readings ORDER BY recorded_at DESC LIMIT 100'
    );
    await redis.setex(cacheKey, 30, JSON.stringify(rows));
    res.json(rows);
  } catch (err) {
    console.error('Query error:', err.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/api/readings/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT region,
             COUNT(*) as count,
             AVG(value) as avg_value,
             MAX(value) as max_value,
             MIN(value) as min_value
      FROM readings
      WHERE recorded_at > NOW() - INTERVAL '24 hours'
      GROUP BY region
      ORDER BY region
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Query failed' });
  }
});

app.post('/api/readings', async (req, res) => {
  try {
    const id = uuidv4();
    const { sensor_id, value, unit, region } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO readings (id, sensor_id, value, unit, region, recorded_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [id, sensor_id || 'sensor-001', value || 0, unit || 'unit', region || 'region-1']
    );
    await redis.del('readings:latest');
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create reading' });
  }
});

app.post('/api/readings/simulate', async (req, res) => {
  try {
    const regions = JSON.parse(process.env.REGIONS || '["region-1","region-2","region-3","region-4","region-5"]');
    const count = parseInt(req.body.count) || 10;
    const records = [];
    for (let i = 0; i < count; i++) {
      const id = uuidv4();
      const { rows } = await pool.query(
        `INSERT INTO readings (id, sensor_id, value, unit, region, recorded_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [
          id,
          `sensor-${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`,
          Math.round(Math.random() * 1000 * 100) / 100,
          'unit',
          regions[Math.floor(Math.random() * regions.length)],
        ]
      );
      records.push(rows[0]);
    }
    await redis.del('readings:latest');
    res.json({ generated: records.length, records });
  } catch (err) {
    res.status(500).json({ error: 'Simulation failed' });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`secondary-service listening on port ${PORT}`));
