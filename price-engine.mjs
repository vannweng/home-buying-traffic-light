const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getProjects(transactions) {
  const byName = new Map();
  for (const row of transactions) {
    const existing = byName.get(row.name);
    if (!existing || row.date > existing.latest) {
      byName.set(row.name, {
        name: row.name,
        address: row.address,
        street: row.street,
        type: row.type,
        latest: row.date,
        count: existing ? existing.count + 1 : 1,
      });
    } else {
      existing.count += 1;
    }
  }
  return [...byName.values()].sort((a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name, 'zh-Hant'));
}

export function comparePrice({ project, transactions, askingUnit, area, asOf = new Date() }) {
  if (!project || !Number.isFinite(askingUnit) || askingUnit <= 0 || !Number.isFinite(area) || area <= 0) {
    throw new Error('請選擇建案並輸入有效的開價與坪數。');
  }
  const asOfTime = new Date(asOf).getTime();
  const suitable = transactions.filter((row) => {
    const age = asOfTime - new Date(`${row.date}T00:00:00`).getTime();
    return age >= 0 && age <= TWO_YEARS_MS && row.type === project.type &&
      row.homeArea >= area * 0.75 && row.homeArea <= area * 1.25 && row.unitPrice > 0;
  });
  const streetCases = suitable.filter((row) => project.street && row.street === project.street && row.name !== project.name);
  const ownCases = suitable.filter((row) => row.name === project.name);
  const mode = streetCases.length >= 3 ? 'same-street' : ownCases.length >= 3 ? 'same-project' : 'insufficient';
  const candidates = mode === 'same-street' ? streetCases : mode === 'same-project' ? ownCases : [];
  const cases = candidates.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const baseline = median(cases.map((row) => row.unitPrice));
  const difference = baseline === null ? null : (askingUnit / baseline - 1) * 100;
  const signal = difference === null ? 'neutral' : difference < 0 ? 'green' : difference > 15 ? 'red' : 'amber';
  return { mode, cases, baseline, difference, signal, available: { street: streetCases.length, project: ownCases.length } };
}
