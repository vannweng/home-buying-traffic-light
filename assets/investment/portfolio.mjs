// Money is held as integer TWD cents. Ratios use nine decimal places.
const SCALE = 1_000_000_000n;
// Keep public JSON number values safely round-trippable at cent precision.
const MAX_CENTS = 100_000_000_000_000n;
export const ASSET_CURRENCIES = [
  { code: 'TWD', name: '新臺幣' }, { code: 'USD', name: '美元' }, { code: 'USDT', name: '泰達幣' },
  { code: 'EUR', name: '歐元' }, { code: 'JPY', name: '日圓' }, { code: 'HKD', name: '港幣' },
  { code: 'CNY', name: '人民幣' }, { code: 'SGD', name: '新加坡幣' }, { code: 'GBP', name: '英鎊' },
  { code: 'AUD', name: '澳幣' }, { code: 'CAD', name: '加拿大幣' }, { code: 'CHF', name: '瑞士法郎' },
  { code: 'KRW', name: '韓元' }, { code: 'NZD', name: '紐西蘭幣' }, { code: 'USDC', name: 'USDC' },
];
const abs = n => n < 0n ? -n : n;
function fixed(value, places, label) {
  if (typeof value !== 'number' && typeof value !== 'string') throw Error(`${label}必須是數字`);
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || !Number.isFinite(Number(text))) throw Error(`${label}必須是有限的非負數`);
  const decimals = match[2] || '';
  const shift = places + Number(match[3] || 0) - decimals.length;
  if (Math.abs(shift) > 100) throw Error(`${label}超出支援精度`);
  const digits = BigInt(match[1] + decimals);
  if (shift >= 0) return digits * 10n ** BigInt(shift);
  const divisor = 10n ** BigInt(-shift);
  if (digits % divisor) throw Error(`${label}最多支援 ${places} 位小數`);
  return digits / divisor;
}
function money(value, label = '金額') {
  const n = fixed(value, 2, label);
  if (n > MAX_CENTS) throw Error(`${label}超出支援範圍`);
  return n;
}
function output(n) {
  if (abs(n) > MAX_CENTS) throw Error('模擬金額超出支援範圍，請縮短期間或降低報酬假設');
  return Number(n) / 100;
}
function ratio(value, label) {
  const n = fixed(value, 9, label);
  if (n > SCALE) throw Error(`${label}必須介於 0% 與 100%`);
  return n;
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw Error(`${label}必須是 ${min} 至 ${max} 的整數`);
  return value;
}
function annual(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 10) throw Error(`${label}必須介於 -100% 與 1000%`);
  return value;
}
function allocate(total, weights) {
  const denominator = weights.reduce((a, b) => a + b, 0n);
  if (!denominator) return weights.map(() => 0n);
  const rows = weights.map((weight, i) => ({ i, n: total * weight / denominator, remainder: total * weight % denominator }));
  let left = total - rows.reduce((sum, row) => sum + row.n, 0n);
  for (const row of [...rows].sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1)) {
    if (!left) break;
    row.n++; left--;
  }
  return rows.map(row => row.n);
}
function parse(input) {
  if (!input || !Array.isArray(input.assets) || !input.assets.length || input.assets.length > 50) throw Error('請設定 1 至 50 項商品');
  const investRatio = ratio(input.target_invest_ratio, '投資比例');
  if (input.target_cash_ratio !== undefined && ratio(input.target_cash_ratio, '現金比例') + investRatio !== SCALE) throw Error('投資比例與現金比例合計必須為 100%');
  const threshold = ratio(input.rebalance_threshold, '再平衡門檻');
  const assets = input.assets.map((asset, i) => {
    if (!asset || typeof asset.symbol !== 'string' || !asset.symbol.trim()) throw Error(`商品 ${i + 1} 缺少代號`);
    return { ...asset, symbol: asset.symbol.trim(), weight: ratio(asset.target_ratio, '商品目標比例'), cents: money(asset.current_value ?? 0, '商品市值') };
  });
  if (new Set(assets.map(a => a.symbol.toUpperCase())).size !== assets.length) throw Error('商品代號不可重複');
  if (assets.reduce((n, a) => n + a.weight, 0n) !== SCALE) throw Error('商品內部目標比例合計必須為 100%');
  const cash = money(input.cash_value ?? 0, '現金');
  return { assets, cash, investRatio, threshold };
}
function targets(total, investRatio, assets) {
  const [invest, cash] = allocate(total, [investRatio, SCALE - investRatio]);
  return { invest, cash, values: allocate(invest, assets.map(a => a.weight)) };
}
function snapshot(assets, cash, investRatio, threshold) {
  const invest = assets.reduce((sum, a) => sum + a.cents, 0n);
  const total = invest + cash;
  if (!total) throw Error('總資產必須大於零');
  output(total);
  const target = targets(total, investRatio, assets);
  const triggered = abs(invest * SCALE - total * investRatio) > total * threshold;
  const trades = assets.map((a, i) => {
    const delta = target.values[i] - a.cents;
    return { symbol: a.symbol, action: delta > 0n ? 'BUY' : delta < 0n ? 'SELL' : 'HOLD', amount: output(abs(delta)), current_value: output(a.cents), target_value: output(target.values[i]), total_target_ratio: Number(investRatio) / Number(SCALE) * Number(a.weight) / Number(SCALE) };
  });
  return {
    total_value: output(total), current_invest_value: output(invest), current_cash_value: output(cash),
    current_invest_ratio: Number(invest) / Number(total), target_invest_ratio: Number(investRatio) / Number(SCALE),
    deviation: Number(invest) / Number(total) - Number(investRatio) / Number(SCALE), should_rebalance: triggered,
    suggested_total_trade: triggered ? output(target.invest - invest) : 0,
    potential_trade_to_exact_target: output(target.invest - invest), potential_trades: trades,
    suggested_trades: triggered ? trades : [], target_invest_value: output(target.invest), target_cash_value: output(target.cash),
    gross_buy: trades.filter(t => t.action === 'BUY').reduce((n, t) => n + money(t.amount), 0n),
  };
}
export function previewRebalance(input) {
  const p = parse(input);
  const result = snapshot(p.assets, p.cash, p.investRatio, p.threshold);
  result.gross_buy = output(result.gross_buy);
  result.gross_sell = output(result.potential_trades.filter(t => t.action === 'SELL').reduce((n, t) => n + money(t.amount), 0n));
  return result;
}
// Use new money up to the total investment shortfall; allocate it among asset shortfalls.
function contribute(p, amount) {
  p.cash += amount;
  const invest = p.assets.reduce((sum, a) => sum + a.cents, 0n);
  const target = targets(invest + p.cash, p.investRatio, p.assets);
  const deficit = target.invest > invest ? target.invest - invest : 0n;
  const budget = amount < deficit ? amount : deficit;
  const gaps = p.assets.map((a, i) => target.values[i] > a.cents ? target.values[i] - a.cents : 0n);
  const buys = allocate(budget, gaps);
  p.assets.forEach((a, i) => { a.cents += buys[i]; p.cash -= buys[i]; });
  return buys;
}
export function previewContribution(input, contribution) {
  const p = parse(input);
  const amount = money(contribution, '新增投入');
  const buys = contribute(p, amount);
  return { contribution: output(amount), contribution_trades: p.assets.map((a, i) => ({ symbol: a.symbol, action: buys[i] ? 'BUY' : 'HOLD', amount: output(buys[i]) })), cash_retained: output(amount - buys.reduce((a, b) => a + b, 0n)), after_contribution: previewRebalance({ ...input, cash_value: output(p.cash), assets: p.assets.map(a => ({ ...a, current_value: output(a.cents) })) }) };
}
function grow(cents, annualReturn) {
  const factor = BigInt(Math.round((1 + annualReturn) ** (1 / 12) * 1e12));
  const next = (cents * factor + 500_000_000_000n) / 1_000_000_000_000n;
  output(next);
  return next;
}
export function simulatePortfolio(input) {
  const s = input.simulation;
  if (!s || s.method !== 'deterministic_monthly' || s.return_conversion !== 'effective_monthly' || s.contribution_timing !== 'end_of_month' || s.rebalance_mode !== 'threshold') throw Error('模擬需使用有效月報酬、月底投入及門檻再平衡');
  const p = parse({ ...input, cash_value: 0, rebalance_threshold: s.rebalance_threshold });
  const initial = money(input.initial_portfolio_value, '初始資產');
  if (!initial) throw Error('初始資產必須大於零');
  const contribution = money(input.monthly_contribution, '每月投入');
  const years = integer(input.simulation_years, 1, 50, '模擬年數');
  const cashReturn = annual(input.cash_annual_return, '現金年化報酬');
  p.assets.forEach(a => annual(a.expected_annual_return, `${a.symbol} 年化報酬`));
  const start = targets(initial, p.investRatio, p.assets);
  p.cash = start.cash; p.assets.forEach((a, i) => a.cents = start.values[i]);
  const rows = [];
  let cumulative = 0n;
  function record(month, rebalanced, buys = [], rebalanceTrades = []) {
    const invest = p.assets.reduce((n, a) => n + a.cents, 0n);
    const total = invest + p.cash;
    output(total);
    rows.push({ month, total_value: output(total), invest_value: output(invest), cash_value: output(p.cash), cash_ratio: total ? Number(p.cash) / Number(total) : null, cumulative_contributions: output(cumulative), total_principal: output(initial + cumulative), investment_profit: output(total - initial - cumulative), rebalance_executed: rebalanced, contribution_trades: buys.map((n, i) => ({ symbol: p.assets[i].symbol, amount: output(n) })), rebalance_trades: rebalanceTrades, assets: p.assets.map(a => ({ symbol: a.symbol, current_value: output(a.cents) })) });
  }
  record(0, false);
  for (let month = 1; month <= years * 12; month++) {
    p.assets.forEach(a => a.cents = grow(a.cents, a.expected_annual_return));
    p.cash = grow(p.cash, cashReturn);
    cumulative += contribution;
    const buys = contribute(p, contribution);
    const state = p.cash + p.assets.reduce((n, a) => n + a.cents, 0n) ? snapshot(p.assets, p.cash, p.investRatio, p.threshold) : { should_rebalance: false, suggested_trades: [] };
    if (state.should_rebalance) {
      const target = targets(money(state.total_value), p.investRatio, p.assets);
      p.assets.forEach((a, i) => a.cents = target.values[i]); p.cash = target.cash;
    }
    record(month, state.should_rebalance, buys, state.suggested_trades);
  }
  const last = rows.at(-1);
  return { summary: { initial_value: output(initial), total_contributions: output(cumulative), total_principal: output(initial + cumulative), projected_final_value: last.total_value, projected_profit: last.investment_profit }, monthly_results: rows };
}
export function defaultPortfolio() {
  return { portfolio_id: 'portfolio_001', name: '我的投資組合', base_currency: 'TWD', settings: { target_invest_ratio: .7, target_cash_ratio: .3, monthly_contribution: 10000, rebalance_threshold: .05, rebalance_frequency: 'monthly', rebalance_mode: 'threshold', simulation_years: 10, contribution_timing: 'end_of_month', auto_execute: false, cash_annual_return: 0 }, assets: [
    { id: 'asset_001', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'ETF', currency: 'USD', target_ratio: .5, current_value: 350000, expected_annual_return: .06 },
    { id: 'asset_002', symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO', currency: 'USD', target_ratio: .3, current_value: 210000, expected_annual_return: .10 },
    { id: 'asset_003', symbol: '0050', name: '元大台灣50', type: 'ETF', currency: 'TWD', target_ratio: .2, current_value: 140000, expected_annual_return: .04 },
  ], cash: { current_value: 300000, currency: 'TWD' } };
}
export function portfolioInput(portfolio) {
  if (!portfolio || typeof portfolio.portfolio_id !== 'string' || !portfolio.portfolio_id.trim() || typeof portfolio.name !== 'string') throw Error('投資組合需要 portfolio_id 與名稱');
  if (!portfolio || portfolio.base_currency !== 'TWD' || portfolio.cash?.currency !== 'TWD') throw Error('第一版以 TWD 為基準，現金與商品市值均須換算為 TWD');
  if (portfolio.settings?.auto_execute !== false || portfolio.settings.rebalance_frequency !== 'monthly' || portfolio.settings.rebalance_mode !== 'threshold' || portfolio.settings.contribution_timing !== 'end_of_month') throw Error('第一版僅支援每月檢查、月底投入、門檻預覽，auto_execute 必須為 false');
  const input = { ...portfolio.settings, cash_value: portfolio.cash.current_value, assets: portfolio.assets };
  previewRebalance(input);
  money(input.monthly_contribution, '每月投入'); integer(input.simulation_years, 1, 50, '模擬年數');
  annual(input.cash_annual_return ?? 0, '現金年化報酬');
  if (new Set(portfolio.assets.map(a => a.id)).size !== portfolio.assets.length || portfolio.assets.some(a => typeof a.id !== 'string' || !a.id || typeof a.name !== 'string' || typeof a.type !== 'string' || typeof a.currency !== 'string' || !/^[A-Z]{3,5}$/.test(a.currency))) throw Error('商品需要唯一 ID、名稱、類型與有效幣別代碼（3 至 5 碼大寫英文字母）');
  portfolio.assets.forEach(a => annual(a.expected_annual_return, `${a.symbol} 年化報酬`));
  return input;
}
