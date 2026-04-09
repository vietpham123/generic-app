import os
import json
import uuid
from flask import Flask, jsonify, request
import psycopg2
import psycopg2.extras
import redis

app = Flask(__name__)

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'timescaledb'),
    'port': int(os.getenv('DB_PORT', '5432')),
    'dbname': os.getenv('DB_NAME', 'appdb'),
    'user': os.getenv('DB_USER', 'appuser'),
    'password': os.getenv('DB_PASSWORD', 'changeme'),
}

cache = redis.Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=int(os.getenv('REDIS_PORT', '6379')),
    decode_responses=True,
)

def get_conn():
    return psycopg2.connect(**DB_CONFIG)

# AGENT: Customize pricing model for industry (e.g., utility rates, shipping rates, hospital billing)
def init_db():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pricing_tiers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                region TEXT NOT NULL,
                tier TEXT NOT NULL DEFAULT 'standard',
                base_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                per_unit_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                unit TEXT NOT NULL DEFAULT 'unit',
                effective_from TIMESTAMPTZ DEFAULT NOW(),
                effective_to TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
        print("Pricing tiers table initialized")
    except Exception as e:
        print(f"DB init error: {e}")

init_db()


@app.route('/health')
def health():
    return jsonify(status='ok', service='pricing-service')


@app.route('/api/pricing')
def get_pricing():
    try:
        cached = cache.get('pricing:all')
        if cached:
            return jsonify(json.loads(cached))

        conn = get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT * FROM pricing_tiers
            WHERE effective_from <= NOW()
              AND (effective_to IS NULL OR effective_to > NOW())
            ORDER BY region, tier
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for r in rows:
            r['id'] = str(r['id'])
            r['effective_from'] = r['effective_from'].isoformat() if r['effective_from'] else None
            r['effective_to'] = r['effective_to'].isoformat() if r['effective_to'] else None
            r['created_at'] = r['created_at'].isoformat() if r['created_at'] else None

        # Group by region
        by_region = {}
        for r in rows:
            region = r['region']
            if region not in by_region:
                by_region[region] = []
            by_region[region].append(r)

        cache.setex('pricing:all', 60, json.dumps(by_region))
        return jsonify(by_region)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route('/api/pricing/calculate', methods=['POST'])
def calculate():
    """Calculate price for given quantity and region."""
    data = request.get_json() or {}
    region = data.get('region', 'region-1')
    quantity = float(data.get('quantity', 1))
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT * FROM pricing_tiers
            WHERE region = %s AND effective_from <= NOW()
              AND (effective_to IS NULL OR effective_to > NOW())
            ORDER BY tier LIMIT 1
        """, (region,))
        tier = cur.fetchone()
        cur.close()
        conn.close()
        if not tier:
            return jsonify(error='No pricing tier found for region'), 404
        total = tier['base_rate'] + (tier['per_unit_rate'] * quantity)
        return jsonify(
            region=region,
            quantity=quantity,
            base_rate=tier['base_rate'],
            per_unit_rate=tier['per_unit_rate'],
            total=round(total, 2),
            unit=tier['unit'],
            tier=tier['tier'],
        )
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route('/api/pricing', methods=['POST'])
def create_tier():
    data = request.get_json() or {}
    try:
        conn = get_conn()
        cur = conn.cursor()
        tier_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO pricing_tiers (id, name, region, tier, base_rate, per_unit_rate, unit, effective_from)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        """, (
            tier_id,
            data.get('name', 'Standard Rate'),
            data.get('region', 'region-1'),
            data.get('tier', 'standard'),
            float(data.get('base_rate', 10.0)),
            float(data.get('per_unit_rate', 0.5)),
            data.get('unit', 'unit'),
        ))
        conn.commit()
        cur.close()
        conn.close()
        cache.delete('pricing:all')
        return jsonify(id=tier_id, status='created'), 201
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route('/api/pricing/simulate', methods=['POST'])
def simulate():
    """Seed pricing tiers for all regions."""
    regions = json.loads(os.getenv('REGIONS', '["region-1","region-2","region-3","region-4","region-5"]'))
    tiers = ['economy', 'standard', 'premium']
    try:
        conn = get_conn()
        cur = conn.cursor()
        count = 0
        for region in regions:
            for i, tier in enumerate(tiers):
                cur.execute("""
                    INSERT INTO pricing_tiers (name, region, tier, base_rate, per_unit_rate, unit, effective_from)
                    VALUES (%s, %s, %s, %s, %s, 'unit', NOW())
                """, (
                    f"{tier.title()} - {region}",
                    region,
                    tier,
                    10.0 + (i * 5),
                    0.25 + (i * 0.15),
                ))
                count += 1
        conn.commit()
        cur.close()
        conn.close()
        cache.delete('pricing:all')
        return jsonify(generated=count)
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', '5003'))
    app.run(host='0.0.0.0', port=port)
