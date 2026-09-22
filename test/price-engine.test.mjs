import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePrice, getProjects, median } from '../price-engine.mjs';

const project = { name: '甲案', street: '連城路', type: '住宅大樓' };
const transactions = [
  { id: '1', name: '乙案', street: '連城路', type: '住宅大樓', date: '2026-04-01', homeArea: 30, unitPrice: 90 },
  { id: '2', name: '乙案', street: '連城路', type: '住宅大樓', date: '2026-03-01', homeArea: 30, unitPrice: 100 },
  { id: '3', name: '丙案', street: '連城路', type: '住宅大樓', date: '2026-02-01', homeArea: 30, unitPrice: 110 },
  { id: '4', name: '甲案', street: '連城路', type: '住宅大樓', date: '2026-01-01', homeArea: 30, unitPrice: 200 },
  { id: '5', name: '丁案', street: '景新街', type: '住宅大樓', date: '2026-01-01', homeArea: 30, unitPrice: 10 },
];

test('median handles even and odd comparable counts', () => {
  assert.equal(median([110, 90, 100]), 100);
  assert.equal(median([110, 90]), 100);
  assert.equal(median([]), null);
});

test('uses other projects on the same road and respects 0% and 15% boundaries', () => {
  const base = { project, transactions, area: 30, asOf: new Date('2026-09-22') };
  assert.equal(comparePrice({ ...base, askingUnit: 99 }).signal, 'green');
  assert.equal(comparePrice({ ...base, askingUnit: 100 }).signal, 'amber');
  assert.equal(comparePrice({ ...base, askingUnit: 115 }).signal, 'amber');
  const result = comparePrice({ ...base, askingUnit: 115.01 });
  assert.equal(result.signal, 'red');
  assert.equal(result.mode, 'same-street');
  assert.equal(result.baseline, 100);
  assert.equal(result.cases.length, 3);
});

test('falls back to the same project, and remains neutral without enough transactions', () => {
  const own = transactions.filter((row) => row.name !== '乙案' && row.name !== '丙案');
  assert.equal(comparePrice({ project, transactions: own, askingUnit: 100, area: 30, asOf: new Date('2026-09-22') }).signal, 'neutral');
  const ownThree = [90, 100, 110].map((unitPrice, index) => ({ ...transactions[3], id: String(index), unitPrice }));
  const result = comparePrice({ project, transactions: ownThree, askingUnit: 100, area: 30, asOf: new Date('2026-09-22') });
  assert.equal(result.mode, 'same-project');
  assert.equal(result.baseline, 100);
});

test('excludes old, different type, and substantially different size sales', () => {
  const bad = [
    { ...transactions[0], date: '2023-01-01' },
    { ...transactions[1], type: '華廈' },
    { ...transactions[2], homeArea: 80 },
  ];
  const result = comparePrice({ project, transactions: bad, askingUnit: 100, area: 30, asOf: new Date('2026-09-22') });
  assert.equal(result.signal, 'neutral');
});

test('project list aggregates names and keeps the latest transaction', () => {
  const list = getProjects(transactions.map((row) => ({ ...row, address: '新北市中和區連城路' })));
  assert.equal(list[0].name, '乙案');
  assert.equal(list[0].count, 2);
});
