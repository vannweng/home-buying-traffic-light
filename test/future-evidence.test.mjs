import test from 'node:test';
import assert from 'node:assert/strict';
import { officialFutureFacilities } from '../future-evidence.mjs';

const project = { latitude: 25, longitude: 121.5 };
const evidence = [{ title: '捷運工程', source: '政府', stations: [
  { name: '施工站', latitude: 25.001, longitude: 121.5, stage: '施工中', criteria: [2, 7] },
  { name: '太遠站', latitude: 25.01, longitude: 121.5, stage: '施工中', criteria: [2] },
  { name: '非建設狀態', latitude: 25.001, longitude: 121.5, stage: '既有', criteria: [2] },
] }];

test('uses only official planned or under-construction facilities within the radius', () => {
  const sites = officialFutureFacilities(project, evidence, 2);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].name, '施工站');
});

test('uses the same rule for any explicitly mapped criterion', () => {
  assert.equal(officialFutureFacilities(project, evidence, 7).length, 1);
  assert.deepEqual(officialFutureFacilities(project, evidence, 4), []);
});
