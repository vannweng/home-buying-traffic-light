import { distanceMeters, hasCoordinates } from './geo-engine.mjs';

const THREE_YEARS_MS = 1096 * 24 * 60 * 60 * 1000;

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values, fraction) {
  if (!values.length || fraction < 0 || fraction > 1) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function summarizeProject({ name, transactions, asOf = new Date() }) {
  const all = transactions.filter((row) => row.name === name && Number.isFinite(row.unitPrice) && row.unitPrice > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  if (!all.length) return null;
  const now = new Date(asOf).getTime();
  const recent = all.filter((row) => {
    const age = now - new Date(`${row.date}T00:00:00`).getTime();
    return age >= 0 && age <= THREE_YEARS_MS;
  });
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const cheapMax = recent.length >= 5 ? percentile(recent.map((row) => row.unitPrice), 0.25) : null;
  const reasonablePrice = recent.length >= 5 ? median(recent.map((row) => row.unitPrice)) : null;
  const expensiveMin = recent.length >= 5 ? percentile(recent.map((row) => row.unitPrice), 0.75) : null;
  const latest = all[0];
  const latestIsRecent = recent.some((row) => row.id === latest.id);
  const signal = cheapMax === null || !latestIsRecent ? 'neutral' : latest.unitPrice <= cheapMax ? 'green' : latest.unitPrice >= expensiveMin ? 'red' : 'amber';
  return {
    name, latest, count: recent.length, signal, cheapMax, reasonablePrice, expensiveMin,
    averageUnitPrice: recent.length ? average(recent.map((row) => row.unitPrice)) : null,
    averageTotalPrice: recent.length ? average(recent.map((row) => row.totalPrice)) : null,
    averageHomeArea: recent.length ? average(recent.map((row) => row.homeArea)) : null,
  };
}

export function getProjects(transactions) {
  const byName = new Map();
  for (const row of transactions) {
    const existing = byName.get(row.name);
    if (!existing) {
      byName.set(row.name, {
        name: row.name, address: row.address, street: row.street, type: row.type,
        first: row.date, latest: row.date, count: 1,
      });
      continue;
    }
    existing.count += 1;
    if (row.date < existing.first) existing.first = row.date;
    if (row.date > existing.latest) {
      existing.latest = row.date;
      existing.address = row.address;
      existing.street = row.street;
    }
  }
  return [...byName.values()].sort((a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name, 'zh-Hant'));
}

export function findComparableProjects({ project, projects, transactions, area, yearTolerance = 3, minDistanceMeters = 0, maxDistanceMeters = 300, asOf = new Date() }) {
  if (!project || !Number.isFinite(area) || area <= 0 || ![1, 2, 3].includes(yearTolerance) || !Number.isFinite(minDistanceMeters) || !Number.isFinite(maxDistanceMeters) || minDistanceMeters < 0 || maxDistanceMeters < minDistanceMeters) {
    throw new Error('請選擇建案、輸入有效坪數並設定年份差距。');
  }
  if (!hasCoordinates(project)) return [];
  const targetYear = Number(project.first?.slice(0, 4));
  const now = new Date(asOf).getTime();
  const eligible = transactions.filter((row) => {
    const age = now - new Date(`${row.date}T00:00:00`).getTime();
    return age >= 0 && age <= THREE_YEARS_MS && row.type === project.type &&
      row.homeArea >= area * 0.75 && row.homeArea <= area * 1.25 && row.unitPrice > 0;
  });
  return projects.map((candidate) => ({ candidate, distanceMeters: distanceMeters(project, candidate) }))
    .filter(({ candidate, distanceMeters: meters }) => candidate.name !== project.name && candidate.type === project.type &&
      Number.isFinite(meters) && meters >= minDistanceMeters && meters <= maxDistanceMeters &&
      Math.abs(Number(candidate.first.slice(0, 4)) - targetYear) <= yearTolerance
    ).map(({ candidate, distanceMeters: meters }) => {
    const cases = eligible.filter((row) => row.name === candidate.name).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    return { ...candidate, cases, baseline: median(cases.map((row) => row.unitPrice)), distanceMeters: meters, sameStreet: Boolean(project.street && candidate.street === project.street) };
  }).filter((candidate) => candidate.cases.length > 0)
    .sort((a, b) => Number(b.sameStreet) - Number(a.sameStreet) ||
      Math.abs(Number(a.first.slice(0, 4)) - targetYear) - Math.abs(Number(b.first.slice(0, 4)) - targetYear) ||
      b.latest.localeCompare(a.latest));
}

export function comparePrice({ project, projects, transactions, askingUnit, area, selectedNames = [], yearTolerance = 3, asOf = new Date() }) {
  if (!Number.isFinite(askingUnit) || askingUnit <= 0) throw new Error('請輸入有效的每坪開價。');
  const candidates = findComparableProjects({ project, projects, transactions, area, yearTolerance, asOf });
  const selected = candidates.filter((candidate) => selectedNames.includes(candidate.name));
  const baseline = selected.length >= 2 ? median(selected.map((candidate) => candidate.baseline)) : null;
  const difference = baseline === null ? null : (askingUnit / baseline - 1) * 100;
  const signal = difference === null ? 'neutral' : difference < 0 ? 'green' : difference > 15 ? 'red' : 'amber';
  return { candidates, selected, baseline, difference, signal };
}

export function cheapestComparableNames(candidates, limit = 3) {
  return [...candidates].sort((a, b) => a.baseline - b.baseline || a.name.localeCompare(b.name, 'zh-Hant'))
    .slice(0, limit).map((candidate) => candidate.name);
}
