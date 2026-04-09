const express = require('express');
const { Pool } = require('pg');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// --- Database ---
const pool = new Pool({
  host: process.env.DB_HOST || 'timescaledb',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'appdb',
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'changeme',
});

// --- Kafka ---
const kafka = new Kafka({
  clientId: 'primary-service',
  brokers: [(process.env.KAFKA_BROKER || 'kafka:9092')],
});
const producer = kafka.producer();
let producerReady = false;

(async () => {
  try {
    await producer.connect();
    producerReady = true;
    console.log('Kafka producer connected');
  } catch (err) {
    console.error('Kafka producer failed to connect:', err.message);
  }
})();

// --- Init DB Table ---
// AGENT: Replace table name and columns with domain-specific entity from industry.yaml
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  region TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'open',
  affected_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
SELECT create_hypertable('incidents', 'created_at', if_not_exists => TRUE);
`;

(async () => {
  try {
    await pool.query(INIT_SQL);
    console.log('Database table initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
})();

// --- Health Check ---
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'primary-service' }));

// --- GET all records ---
// AGENT: Update endpoint path to match industry entity (e.g., /api/outages)
app.get('/api/incidents', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM incidents ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error('Query error:', err.message);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// --- GET single record ---
app.get('/api/incidents/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
});

// --- POST create record ---
app.post('/api/incidents', async (req, res) => {
  try {
    const id = uuidv4();
    const { title, region, severity, affected_count } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO incidents (id, title, region, severity, affected_count, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [id, title || 'Untitled', region || 'region-1', severity || 'low', affected_count || 0]
    );

    // Publish event to Kafka
    if (producerReady) {
      await producer.send({
        topic: process.env.KAFKA_TOPIC || 'generic.incident.created',
        messages: [{ key: id, value: JSON.stringify(rows[0]) }],
      });
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Insert error:', err.message);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// --- PUT update record ---
app.put('/api/incidents/:id', async (req, res) => {
  try {
    const { title, region, severity, status, affected_count, resolved_at } = req.body;
    const { rows } = await pool.query(
      `UPDATE incidents SET
        title = COALESCE($2, title),
        region = COALESCE($3, region),
        severity = COALESCE($4, severity),
        status = COALESCE($5, status),
        affected_count = COALESCE($6, affected_count),
        resolved_at = COALESCE($7, resolved_at)
       WHERE id = $1 RETURNING *`,
      [req.params.id, title, region, severity, status, affected_count, resolved_at]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// --- Simulate: generate random records ---
app.post('/api/incidents/simulate', async (req, res) => {
  try {
    const regions = JSON.parse(process.env.REGIONS || '["region-1","region-2","region-3","region-4","region-5"]');
    const severities = ['low', 'medium', 'high', 'critical'];
    const count = parseInt(req.body.count) || 5;

    const records = [];
    for (let i = 0; i < count; i++) {
      const id = uuidv4();
      const { rows } = await pool.query(
        `INSERT INTO incidents (id, title, region, severity, affected_count, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [
          id,
          `Incident ${Date.now()}-${i}`,
          regions[Math.floor(Math.random() * regions.length)],
          severities[Math.floor(Math.random() * severities.length)],
          Math.floor(Math.random() * 10000),
        ]
      );
      records.push(rows[0]);
    }
    res.json({ generated: records.length, records });
  } catch (err) {
    res.status(500).json({ error: 'Simulation failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`primary-service listening on port ${PORT}`));
