import { median } from './price-engine.mjs';

export function analyzeTrend(project, transactions, evidence = [], asOf = new Date()) {
  const cutoff = new Date(asOf);
  cutoff.setFullYear(cutoff.getFullYear() - 3);
  const rows = transactions.filter((row) => row.name === project.name && row.date >= cutoff.toISOString().slice(0, 10) && row.date <= asOf.toISOString().slice(0, 10) && row.unitPrice > 0);
  const byYear = new Map();
  for (const row of rows) {
    const year = row.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) || []), row.unitPrice]);
  }
  const years = [...byYear].sort(([a], [b]) => a.localeCompare(b)).map(([year, prices]) => ({ year, count: prices.length, median: median(prices) }));
  const reliable = years.filter((item) => item.count >= 5);
  const first = reliable[0];
  const last = reliable.at(-1);
  const change = reliable.length >= 2 ? (last.median / first.median - 1) * 100 : null;
  const leads = evidence.filter((item) => item.street && item.street === project.street);
  return { years, change, leads, count: rows.length };
}
