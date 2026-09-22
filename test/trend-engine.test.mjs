import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrend } from '../trend-engine.mjs';

test('trend requires enough observations in two years to compare prices', () => {
  const rows = [2024, 2025].flatMap((year, index) => Array.from({ length: 5 }, (_, i) => ({ name: '甲案', date: `${year}-06-${String(i + 1).padStart(2, '0')}`, unitPrice: index ? 110 : 100 })));
  const result = analyzeTrend({ name: '甲案', street: '連城路' }, rows, [{ street: '連城路' }, { street: '景平路' }], new Date('2026-09-22'));
  assert.equal(result.change, 10.000000000000009);
  assert.equal(result.leads.length, 1);
});

test('sparse or stale data does not produce price direction', () => {
  const result = analyzeTrend({ name: '甲案', street: '連城路' }, [{ name: '甲案', date: '2020-01-01', unitPrice: 100 }, { name: '甲案', date: '2026-01-01', unitPrice: 120 }], [], new Date('2026-09-22'));
  assert.equal(result.change, null);
  assert.equal(result.years.length, 1);
});
