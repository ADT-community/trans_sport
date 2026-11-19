const request = require('supertest');
const app = require('../src/server');

// Token must match the one used in the route implementation
const AUTH_TOKEN = process.env.LOCATION_API_TOKEN || 'test-token';
const authHeader = `Bearer ${AUTH_TOKEN}`;

describe('Location Ping API', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/location').send({});
    expect(res.status).toBe(401);
  });

  test('stores a single ping correctly', async () => {
    const ping = { vehicleId: 'veh1', lat: 6.5, lng: 3.4 };
    const postRes = await request(app)
      .post('/api/location')
      .set('Authorization', authHeader)
      .send(ping);
    expect(postRes.status).toBe(201);
    expect(postRes.body.received).toBe(1);

    const getRes = await request(app)
      .get('/api/location/veh1')
      .set('Authorization', authHeader);
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body)).toBe(true);
    expect(getRes.body).toHaveLength(1);
    expect(getRes.body[0]).toMatchObject({ lat: ping.lat, lng: ping.lng });
  });

  test('handles burst array of pings', async () => {
    const burst = [
      { vehicleId: 'veh2', lat: 1, lng: 2 },
      { vehicleId: 'veh2', lat: 3, lng: 4 },
    ];
    const postRes = await request(app)
      .post('/api/location')
      .set('Authorization', authHeader)
      .send(burst);
    expect(postRes.status).toBe(201);
    expect(postRes.body.received).toBe(2);

    const getRes = await request(app)
      .get('/api/location/veh2')
      .set('Authorization', authHeader);
    expect(getRes.body).toHaveLength(2);
    expect(getRes.body[0]).toMatchObject({ lat: 1, lng: 2 });
    expect(getRes.body[1]).toMatchObject({ lat: 3, lng: 4 });
  });
});
