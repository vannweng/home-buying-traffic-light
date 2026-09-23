import test from 'node:test';
import assert from 'node:assert/strict';
import { cheapestComparableNames, comparePrice, findComparableProjects, getProjects, median, percentile, summarizeProject } from '../price-engine.mjs';

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
const withCoordinates = (list) => list.map((item) => ({ ...item, latitude: 25, longitude: 121.5 }));
const projects = withCoordinates(getProjects(transactions));
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

test('uses the subject sale and permits a signal from one development', () => {
  const subjectOnly = comparePrice({ ...base, askingUnit: 100, selectedNames: [] });
  assert.equal(subjectOnly.signal, 'amber');
  assert.equal(subjectOnly.baseline, 100);
  assert.equal(subjectOnly.own.name, '甲案');
  assert.equal(subjectOnly.benchmarkProjects.length, 1);
  const two = comparePrice({ ...base, askingUnit: 100, selectedNames: ['乙案', '丙案'] });
  assert.equal(two.signal, 'amber');
  assert.equal(two.baseline, 100);
  const one = comparePrice({ ...base, askingUnit: 100, selectedNames: ['乙案'] });
  assert.equal(one.signal, 'amber');
  assert.equal(one.selected.length, 1);
});

test('does not classify when neither subject nor selected projects have usable sales', () => {
  const stale = row('無交易本案', 100, '2020-01-01');
  const onlyProject = withCoordinates(getProjects([stale]))[0];
  const result = comparePrice({ project: onlyProject, projects: [onlyProject], transactions: [stale], askingUnit: 100, area: 30, asOf: new Date('2026-09-23') });
  assert.equal(result.signal, 'neutral');
  assert.equal(result.own, null);
  assert.equal(result.benchmarkProjects.length, 0);
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
  const located = withCoordinates(getProjects(sample));
  const result = comparePrice({
    project: located.find((item) => item.name === '新案'), projects: located,
    transactions: sample, askingUnit: 100, area: 30, yearTolerance: 1,
    selectedNames: ['乙案', '丙案', '辛案'], asOf: new Date('2026-09-22'),
  });
  assert.equal(result.selected.some((item) => item.name === '辛案'), false);
  assert.equal(result.signal, 'amber');
});

test('selects the three cheapest projects by each project median', () => {
  const candidates = findComparableProjects(base);
  assert.deepEqual(cheapestComparableNames(candidates), ['丙案', '乙案', '丁案']);
  assert.deepEqual(cheapestComparableNames(candidates, 2), ['丙案', '乙案']);
});

test('strictly excludes projects beyond 300 metres', () => {
  const distant = projects.map((item) => item.name === '丁案' ? { ...item, latitude: 25.01 } : item);
  assert.deepEqual(findComparableProjects({ ...base, projects: distant }).map((item) => item.name), ['乙案', '丙案']);
});

test('median handles even and odd case counts', () => {
  assert.equal(median([90, 100, 110]), 100);
  assert.equal(median([90, 110]), 100);
  assert.equal(median([]), null);
});

test('watchlist uses the latest transaction and three-year percentiles', () => {
  const sales = [80, 90, 100, 110, 120].map((unitPrice, index) => ({
    ...row('觀察案', unitPrice, `2026-0${index + 1}-01`), totalPrice: unitPrice * 30, id: String(index),
  }));
  const result = summarizeProject({ name: '觀察案', transactions: sales, asOf: new Date('2026-09-22') });
  assert.equal(result.latest.unitPrice, 120);
  assert.equal(result.latest.date, '2026-05-01');
  assert.equal(result.averageUnitPrice, 100);
  assert.equal(result.averageTotalPrice, 3000);
  assert.equal(result.averageHomeArea, 30);
  assert.equal(result.cheapMax, 90);
  assert.equal(result.reasonablePrice, 100);
  assert.equal(result.expensiveMin, 110);
  assert.equal(result.signal, 'red');
  assert.equal(percentile([80, 90, 100, 110, 120], 0.25), 90);
});

test('watchlist does not classify sparse or stale transaction history', () => {
  const sparse = [row('少量案', 80), row('少量案', 90)];
  const result = summarizeProject({ name: '少量案', transactions: sparse, asOf: new Date('2026-09-22') });
  assert.equal(result.count, 2);
  assert.equal(result.signal, 'neutral');
  assert.equal(result.cheapMax, null);
  const stale = [row('舊案', 80, '2022-01-01')];
  const old = summarizeProject({ name: '舊案', transactions: stale, asOf: new Date('2026-09-22') });
  assert.equal(old.count, 0);
  assert.equal(old.latest.date, '2022-01-01');
  assert.equal(old.averageUnitPrice, null);
  assert.equal(old.signal, 'neutral');
});
