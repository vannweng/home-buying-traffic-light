import test from 'node:test';
import assert from 'node:assert/strict';
import { addLocation, distanceMeters, hasCoordinates } from '../geo-engine.mjs';

test('attaches cached location and nearby facilities without inventing missing coordinates', () => {
  const projects = addLocation([{ name: '甲案' }, { name: '乙案' }], { generatedAt: '2026-09-23', geocoder: 'OSM', projects: { 甲案: { lat: 25, lon: 121.5, nearby: { park: [] } } } });
  assert.equal(hasCoordinates(projects[0]), true);
  assert.equal(hasCoordinates(projects[1]), false);
  assert.deepEqual(projects[0].nearby, { park: [] });
});

test('calculates direct distance and rejects missing coordinates', () => {
  assert.ok(distanceMeters({ latitude: 25, longitude: 121.5 }, { latitude: 25.001, longitude: 121.5 }) > 100);
  assert.equal(distanceMeters({ latitude: 25 }, { latitude: 25, longitude: 121.5 }), null);
});
