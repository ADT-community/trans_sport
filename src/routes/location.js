const express = require('express');
const router = express.Router();

// Token used for simple auth – set via env or fallback to a static value for dev
const AUTH_TOKEN = process.env.LOCATION_API_TOKEN || 'test-token';

// In‑memory store: vehicleId => [{ lat, lng, timestamp }]
const locationStore = new Map();

/** Middleware to enforce Bearer token authentication */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.slice('Bearer '.length);
  if (token !== AUTH_TOKEN) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  next();
}

/**
 * POST /api/location
 * Accepts a single ping or an array of pings.
 * Body schema: { vehicleId: string, lat: number, lng: number, timestamp?: number }
 */
router.post('/location', authMiddleware, (req, res) => {
  const payload = req.body;
  const pings = Array.isArray(payload) ? payload : [payload];
  const now = Date.now();

  for (const ping of pings) {
    const { vehicleId, lat, lng, timestamp } = ping;
    if (!vehicleId || typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Invalid ping format' });
    }
    const entry = {
      lat,
      lng,
      timestamp: typeof timestamp === 'number' ? timestamp : now,
    };
    if (!locationStore.has(vehicleId)) {
      locationStore.set(vehicleId, []);
    }
    locationStore.get(vehicleId).push(entry);
  }

  res.status(201).json({ received: pings.length });
});

/**
 * GET /api/location/:vehicleId
 * Returns stored pings for a given vehicle – useful for debugging.
 */
router.get('/location/:vehicleId', authMiddleware, (req, res) => {
  const { vehicleId } = req.params;
  const data = locationStore.get(vehicleId) || [];
  res.json(data);
});

module.exports = { router, locationStore };
