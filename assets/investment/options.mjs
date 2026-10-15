export const PERIODS = [20, 60, 252];
const numeric = (value, label, allowZero = false) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw Error(`請輸入${label}`);
  const n = Number(value);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) throw Error(`${label}必須${allowZero ? '大於或等於' : '大於'}零`);
  if (n > 1e12) throw Error(`${label}超出支援範圍`);
  return n;
};
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw Error('日期需使用 YYYY-MM-DD');
  return value;
}
export function marketDate(time = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
}
export function parseCloseCSV(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) throw Error('CSV 太大或格式不正確');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!/^date\s*,\s*close$/i.test(lines.shift()?.trim())) throw Error('CSV 首行需為 date,close，後續每行填入日期與收盤價');
  const rows = lines.filter(line => line.trim()).map(line => {
    const values = line.split(',').map(v => v.trim());
    if (values.length !== 2) throw Error('CSV 每行需有日期、收盤價兩欄');
    const date = dateOnly(values[0]);
    const day = new Date(date).getUTCDay();
    if (day === 0 || day === 6) throw Error('請只提供交易日收盤資料，移除週末日期');
    return { date, close: numeric(values[1], '收盤價') };
  });
  if (new Set(rows.map(r => r.date)).size !== rows.length) throw Error('收盤資料有重複日期');
  if (rows.length > 5000) throw Error('最多匯入 5,000 筆收盤資料');
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
export function evaluateSignal(settings, observation, history = [], now = new Date()) {
  if (!['NDX', 'QQQ'].includes(settings.symbol) || !PERIODS.includes(settings.lookback)) throw Error('請選擇支援的觀察標的與期間');
  const threshold = numeric(settings.drawdown_percent, '回落門檻');
  if (threshold >= 100) throw Error('回落門檻必須小於 100%');
  const price = numeric(observation.current_price, '目前價格');
  const time = new Date(observation.quoted_at);
  if (!observation.quoted_at || !Number.isFinite(time.getTime()) || time.getTime() > now.getTime() + 300_000) throw Error('請填入有效的報價時間，且不可晚於目前時間');
  const date = marketDate(time);
  let high, highDate, fromDate, count;
  if (observation.mode === 'csv') {
    const prior = history.filter(r => r.date < date);
    if (prior.length < settings.lookback) throw Error(`需要至少 ${settings.lookback} 筆報價日期之前的日收盤資料，目前只有 ${prior.length} 筆`);
    const rows = prior.slice(-settings.lookback);
    const highest = rows.reduce((a, b) => b.close >= a.close ? b : a);
    high = highest.close; highDate = highest.date; fromDate = rows[0].date; count = rows.length;
  } else if (observation.mode === 'manual') {
    high = numeric(observation.high_price, '期間最高收盤價'); highDate = dateOnly(observation.high_date);
    if (highDate >= date) throw Error('高點日期需早於本次報價的美東日期，使用已完成交易日的收盤價');
    count = null; fromDate = null;
  } else throw Error('請選擇高點資料輸入方式');
  const drawdown = Math.max(0, (high - price) / high * 100);
  return { symbol: settings.symbol, lookback: settings.lookback, high_price: high, high_date: highDate, from_date: fromDate, sample_count: count, current_price: price, drawdown_percent: drawdown, threshold_percent: threshold, trigger_price: high * (1 - threshold / 100), condition_met: price <= high * (1 - threshold / 100) + 1e-10, quoted_at: time.toISOString(), stale: now.getTime() - time.getTime() > 15 * 60_000, source: observation.mode, market_date: date };
}
export function contractGuide(price, days = 90, otm = 5, from = new Date()) {
  const n = numeric(price, 'QQQ 現價');
  if (!Number.isInteger(days) || days < 1 || days > 1095) throw Error('到期天數需介於 1 至 1095 天');
  const percent = numeric(otm, '價外幅度', true);
  if (percent > 100) throw Error('價外幅度需介於 0% 至 100%');
  const date = new Date(marketDate(from) + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + days);
  return { reference_strike: n * (1 + percent / 100), reference_expiration: date.toISOString().slice(0, 10), days, otm_percent: percent };
}
export function evaluatePosition(position, now = new Date()) {
  const buy = numeric(position.buy_premium, '買入權利金');
  const current = numeric(position.current_premium, '目前權利金', true);
  if (!Number.isInteger(position.contracts) || position.contracts < 1 || position.contracts > 10000) throw Error('持倉口數需為 1 至 10,000 的整數');
  const strike = numeric(position.strike, '履約價');
  const expiry = dateOnly(position.expiration);
  const take = numeric(position.take_profit_percent, '停利百分比');
  const stop = numeric(position.stop_loss_percent, '停損百分比');
  if (stop > 100) throw Error('停損百分比不得超過 100%');
  const time = new Date(position.quoted_at);
  if (!position.quoted_at || !Number.isFinite(time.getTime()) || time.getTime() > now.getTime() + 300_000) throw Error('請填入有效的權利金報價時間');
  const expiryDays = Math.round((Date.parse(expiry) - Date.parse(marketDate(now))) / 86_400_000);
  const pnl = (current - buy) / buy * 100;
  const takeHit = current >= buy * (1 + take / 100) - 1e-10;
  const stopHit = current <= buy * (1 - stop / 100) + 1e-10;
  const half = Math.floor(position.contracts / 2);
  return { symbol: 'QQQ', type: 'CALL', strike, expiration: expiry, days_to_expiry: expiryDays, expired: expiryDays < 0, pnl_percent: pnl, cost_usd: buy * 100 * position.contracts, market_value_usd: current * 100 * position.contracts, unrealized_pnl_usd: (current - buy) * 100 * position.contracts, max_premium_loss_usd: buy * 100 * position.contracts, take_price: buy * (1 + take / 100), stop_price: buy * (1 - stop / 100), take_profit_met: takeHit, stop_loss_met: stopHit, take_profit_contracts: half, remaining_contracts: position.contracts - half, exactly_half: position.contracts % 2 === 0, break_even_at_expiry: strike + buy, quoted_at: time.toISOString(), stale: now.getTime() - time.getTime() > 15 * 60_000 };
}
export function defaultOptions() {
  return { version: 1, settings: { symbol: 'NDX', lookback: 60, drawdown_percent: 3, days_to_expiry: 90, otm_percent: 5 }, observation: { mode: 'manual', current_price: '', high_price: '', high_date: '', quoted_at: '' }, history_csv: '', qqq_price: '', position: { contracts: 2, buy_premium: '', current_premium: '', strike: '', expiration: '', quoted_at: '', take_profit_percent: 100, stop_loss_percent: 30 } };
}
