import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePrice, findComparableProjects, getProjects, median } from '../price-engine.mjs';

const row = (name, unitPrice, date = '2026-04-01', homeArea = 30, type = '住宅大樓', street = '連城路') =>
  ({ id: `${name}-${unitPrice}`, name, address: `新北市中和區${street}`, street, type, date, homeArea, unitPrice });
const transactions = [
  row('甲案', 100, '2025-03-01'),
  row('乙案', 90), row('乙案', 110),
  row('丙案', 95, '2026-03-01', 30, '住宅大樓', '景新街'),
  row('丁案', 105, '2026-02-01', 30, '住宅大樓', '景平路'),
  row('戊案', 70, '2026-02-01', 80),
  row('己案', 70, '2023-01-01'),
  row('庚案', 70, '2026-02-01', 30, '華廈'),
];
const projects = getProjects(transactions);
const project = projects.find((item) => item.name === '甲案');
const base = { project, projects, transactions, area: 30, asOf: new Date('2026-09-22') };

test('project year is the earliest published transaction year', () => {
  const list = getProjects([row('甲案', 100, '2026-01-01'), row('甲案', 90, '2024-01-01')]);
  assert.equal(list[0].first, '2024-01-01');
  assert.equal(list[0].latest, '2026-01-01');
});

test('finds different projects with similar year, type, size and recent sales', () => {
  const candidates = findComparableProjects(base);
  assert.deepEqual(candidates.map((item) => item.name), ['乙案', '丙案', '丁案']);
  assert.equal(candidates[0].baseline, 100);
  assert.equal(candidates[0].sameStreet, true);
  assert.equal(candidates[1].sameStreet, false);
});

test('requires three distinct selected developments before showing any signal', () => {
  const two = comparePrice({ ...base, askingUnit: 100, selectedNames: ['乙案', '丙案'] });
  assert.equal(two.signal, 'neutral');
  assert.equal(two.baseline, null);
  const repeated = comparePrice({ ...base, askingUnit: 100, selectedNames: ['乙案', '乙案', '丙案'] });
  assert.equal(repeated.signal, 'neutral');
  assert.equal(repeated.selected.length, 2);
});

test('weights each project once and applies the red, amber, green thresholds', () => {
  const selectedNames = ['乙案', '丙案', '丁案'];
  const options = { ...base, selectedNames };
  assert.equal(comparePrice({ ...options, askingUnit: 99 }).signal, 'green');
  assert.equal(comparePrice({ ...options, askingUnit: 100 }).signal, 'amber');
  assert.equal(comparePrice({ ...options, askingUnit: 115 }).signal, 'amber');
  const result = comparePrice({ ...options, askingUnit: 115.01 });
  assert.equal(result.signal, 'red');
  assert.equal(result.baseline, 100);
  assert.equal(result.selected.length, 3);
});

test('changing the allowed first sale year removes an older selected project', () => {
  const older = row('辛案', 99, '2024-01-01');
  const newerTarget = row('新案', 100, '2026-01-01');
  const sample = [newerTarget, older, ...transactions.filter((item) => ['乙案', '丙案'].includes(item.name))];
  const result = comparePrice({
    project: getProjects(sample).find((item) => item.name === '新案'), projects: getProjects(sample),
    transactions: sample, askingUnit: 100, area: 30, yearTolerance: 1,
    selectedNames: ['乙案', '丙案', '辛案'], asOf: new Date('2026-09-22'),
  });
  assert.equal(result.selected.some((item) => item.name === '辛案'), false);
  assert.equal(result.signal, 'neutral');
});

test('median handles even and odd case counts', () => {
  assert.equal(median([90, 100, 110]), 100);
  assert.equal(median([90, 110]), 100);
  assert.equal(median([]), null);
});
