import { defaultPortfolio, portfolioInput, previewRebalance, previewContribution, simulatePortfolio } from './portfolio.mjs';
import { defaultOptions, parseCloseCSV, evaluateSignal, contractGuide, evaluatePosition } from './options.mjs';

const $ = selector => document.querySelector(selector);
const form = $('#portfolioForm');
const optionForm = $('#optionsForm');
const KEY = 'life-lab-investment-toolkit-v1';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = n => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(n);
const twd = n => `NT$${number(n)}`;
const usd = n => `US$${number(n)}`;
const pct = n => n === null ? '—' : `${number(n * 100)}%`;
const fieldNames = ['name', 'invest', 'cash', 'monthly', 'threshold', 'cashValue', 'years', 'cashReturn'];
const assetNames = ['id', 'symbol', 'name', 'type', 'currency', 'value', 'weight', 'annual'];
const ungroup = value => String(value).replace(/,/g, '');
function formatTwd(input) {
  const raw = ungroup(input.value), caret = input.selectionStart;
  const before = caret === null ? 0 : ungroup(input.value.slice(0, caret)).length;
  if (/^\d*(?:\.\d*)?$/.test(raw)) {
    const [whole, fraction] = raw.split('.');
    input.value = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
    if (document.activeElement === input && caret !== null) {
      let pos = 0, count = 0;
      while (pos < input.value.length && count < before) { if (input.value[pos] !== ',') count++; pos++; }
      input.setSelectionRange(pos, pos);
    }
  }
  if (raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0) input.setAttribute('aria-valuenow', raw);
  else input.removeAttribute('aria-valuenow');
  input.setAttribute('aria-valuetext', input.value);
}
function stepTwd(input, direction) {
  const raw = ungroup(input.value);
  if (raw && !/^\d*(?:\.\d{0,2})?$/.test(raw)) return;
  const [whole, fraction = ''] = raw.split('.');
  const cents = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  const stepped = cents + BigInt(direction) * 100000n;
  const next = stepped < 0n ? 0n : stepped;
  input.value = String(next / 100n) + (next % 100n ? '.' + String(next % 100n).padStart(2, '0') : '');
  input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function draftFromPortfolio(p) {
  portfolioInput(p);
  return { portfolio_id: p.portfolio_id, name: p.name, invest: String(p.settings.target_invest_ratio * 100), cash: String(p.settings.target_cash_ratio * 100), monthly: String(p.settings.monthly_contribution), threshold: String(p.settings.rebalance_threshold * 100), cashValue: String(p.cash.current_value), years: String(p.settings.simulation_years), cashReturn: String((p.settings.cash_annual_return ?? 0) * 100), assets: p.assets.map(a => ({ id: a.id, symbol: a.symbol, name: a.name, type: a.type, currency: a.currency, value: String(a.current_value), weight: String(a.target_ratio * 100), annual: String(a.expected_annual_return * 100) })) };
}
function initialState() { return { version: 1, portfolioDraft: draftFromPortfolio(defaultPortfolio()), options: defaultOptions(), signals: {} }; }
function validateState(v) {
  if (!v || v.version !== 1 || !v.portfolioDraft || !v.options || !v.signals || typeof v.signals !== 'object' || Array.isArray(v.signals)) throw Error('工具備份版本或格式不符');
  const d = v.portfolioDraft;
  if (fieldNames.some(k => typeof d[k] !== 'string') || !Array.isArray(d.assets) || d.assets.length > 50 || d.assets.some(a => !a || assetNames.some(k => typeof a[k] !== 'string')) || new Set(d.assets.map(a => a.id)).size !== d.assets.length) throw Error('配置草稿格式不完整');
  const o = v.options, sample = defaultOptions();
  if (o.version !== 1 || typeof o.history_csv !== 'string' || o.history_csv.length > 1_000_000 || !['string', 'number'].includes(typeof o.qqq_price)) throw Error('期權資料格式不完整');
  for (const group of ['settings', 'observation', 'position']) {
    if (!o[group] || Object.keys(sample[group]).some(k => !['string', 'number'].includes(typeof o[group][k]))) throw Error('期權設定格式不完整');
  }
  if (!['NDX', 'QQQ'].includes(o.settings.symbol) || ![20, 60, 252].includes(o.settings.lookback) || !['manual', 'csv'].includes(o.observation.mode)) throw Error('期權觀察設定不支援');
  if (Object.values(v.signals).some(s => !s || typeof s.met !== 'boolean' || typeof s.at !== 'string')) throw Error('提醒紀錄格式不符');
  return v;
}
let state = initialState(), rawSaved = null, locked = false, timer, dirty = false, simulation = null, removedAsset = null;
try { rawSaved = localStorage.getItem(KEY); if (rawSaved) state = validateState(JSON.parse(rawSaved)); }
catch { locked = true; }
function storageStatus(text, error = false) { $('#storageStatus').textContent = text; $('#storageStatus').style.color = error ? 'var(--accent)' : ''; }
function persist() {
  clearTimeout(timer); timer = null;
  if (locked) { storageStatus('原資料無法讀取，儲存已停用；可先下載原始備份，再重設工具資料。', true); return; }
  try { const data = JSON.stringify({ ...state, saved_at: new Date().toISOString() }); localStorage.setItem(KEY, data); rawSaved = data; dirty = false; storageStatus('已儲存在此瀏覽器・' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })); }
  catch { storageStatus('無法儲存到瀏覽器；請下載完整備份保留目前輸入。', true); }
}
function saveSoon() { dirty = true; storageStatus(locked ? '原資料無法讀取，儲存已停用。' : '正在儲存…', locked); clearTimeout(timer); timer = setTimeout(persist, 250); }
function download(filename, content, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function errorAt(id, error) { const el = $(id); el.hidden = !error; el.textContent = error?.message || error || ''; }
function requiredNumber(value, label) {
  if (String(value).trim() === '' || !Number.isFinite(Number(value))) throw Error(`請輸入有效的${label}`);
  return Number(value);
}
const percent = (value, label) => Number((requiredNumber(value, label) / 100).toFixed(9));
function toPortfolio() {
  const d = state.portfolioDraft;
  const p = { portfolio_id: d.portfolio_id || 'portfolio_001', name: d.name, base_currency: 'TWD', settings: { target_invest_ratio: percent(d.invest, '投資比例'), target_cash_ratio: percent(d.cash, '現金比例'), monthly_contribution: requiredNumber(d.monthly, '每月投入'), rebalance_threshold: percent(d.threshold, '門檻'), rebalance_frequency: 'monthly', rebalance_mode: 'threshold', simulation_years: requiredNumber(d.years, '模擬年數'), contribution_timing: 'end_of_month', auto_execute: false, cash_annual_return: percent(d.cashReturn, '現金年化報酬') }, cash: { current_value: requiredNumber(d.cashValue, '現金'), currency: 'TWD' }, assets: d.assets.map(a => ({ id: a.id, symbol: a.symbol, name: a.name, type: a.type, currency: a.currency, current_value: requiredNumber(a.value, '商品市值'), target_ratio: percent(a.weight, '商品比例'), expected_annual_return: percent(a.annual, '商品年化報酬') })) };
  portfolioInput(p); return p;
}
function capturePortfolio() {
  fieldNames.forEach(name => { const input = form.elements.namedItem(name); state.portfolioDraft[name] = input.hasAttribute('data-twd') ? ungroup(input.value) : input.value; });
  state.portfolioDraft.assets = [...$('#assetEditor').children].map(row => {
    const value = { id: row.dataset.id }; row.querySelectorAll('[data-property]').forEach(input => value[input.dataset.property] = input.hasAttribute('data-twd') ? ungroup(input.value) : input.value); return value;
  });
}
function renderAssetEditor() {
  $('#assetEditor').innerHTML = state.portfolioDraft.assets.map((a, i) => {
    const input = (prop, title, type = 'text', attrs = '') => prop === 'value' ? `<div class="twd-field"><label for="asset-value-${i}">${title}</label><div class="twd-control"><input id="asset-value-${i}" aria-label="商品 ${i + 1} ${title}" data-property="value" type="text" inputmode="decimal" data-twd role="spinbutton" aria-valuemin="0" autocomplete="off" value="${esc(a[prop])}" /><input class="twd-native-stepper" type="number" step="1000" value="0" data-twd-native tabindex="-1" aria-hidden="true" /></div></div>` : `<label>${title}<input aria-label="商品 ${i + 1} ${title}" data-property="${prop}" type="${type}" value="${esc(a[prop])}" ${attrs} /></label>`;
    return `<div class="asset-row" data-id="${esc(a.id)}">${input('symbol', '商品代號', 'text', 'maxlength="24"')}${input('name', '商品名稱', 'text', 'maxlength="100"')}${input('type', '類型', 'text', 'maxlength="20"')}${input('currency', '原幣別', 'text', 'maxlength="3"')}${input('value', '市值（TWD）', 'number', 'min="0" step="1000"')}${input('weight', '投資內比例（%）', 'number', 'min="0" max="100" step="0.01"')}${input('annual', '假設年化（%）', 'number', 'min="-100" max="1000" step="0.01"')}<button class="delete-asset" type="button" aria-label="刪除商品 ${esc(a.symbol || i + 1)}" title="刪除商品">×</button></div>`;
  }).join('');
  $('#assetEditor').querySelectorAll('[data-twd]').forEach(formatTwd);
}
function hydratePortfolio() {
  const d = state.portfolioDraft;
  if (![...form.elements.years.options].some(o => o.value === d.years)) form.elements.years.add(new Option(`${d.years} 年`, d.years));
  fieldNames.forEach(name => { const input = form.elements.namedItem(name); input.value = d[name]; if (input.hasAttribute('data-twd')) formatTwd(input); }); renderAssetEditor(); updatePreview();
}
const metric = (title, value, detail = '') => `<div class="metric"><dt>${esc(title)}</dt><dd>${esc(value)}${detail ? `<small>${esc(detail)}</small>` : ''}</dd></div>`;
function tradeTable(trades) {
  return `<div class="table-scroll"><table><caption class="sr-only">各商品回到精確目標的交易金額</caption><thead><tr><th>商品</th><th>總資產目標占比</th><th>目前市值</th><th>目標市值</th><th>交易</th></tr></thead><tbody>${trades.map(t => `<tr><td>${esc(t.symbol)}</td><td>${pct(t.total_target_ratio)}</td><td>${number(t.current_value)}</td><td>${number(t.target_value)}</td><td class="trade-${t.action.toLowerCase()}">${t.action === 'HOLD' ? '不調整' : `${t.action === 'BUY' ? '買進' : '賣出'} ${number(t.amount)}`}</td></tr>`).join('')}</tbody></table></div>`;
}
function updatePreview() {
  const sum = state.portfolioDraft.assets.reduce((n, a) => n + (Number(a.weight) || 0), 0);
  $('#weightTotal').textContent = `商品比例合計 ${number(sum)}%`;
  try {
    const p = toPortfolio(), input = portfolioInput(p), r = previewRebalance(input), c = previewContribution(input, p.settings.monthly_contribution);
    errorAt('#portfolioError', null);
    const direction = r.potential_trade_to_exact_target >= 0 ? '買進' : '賣出';
    const exact = r.gross_buy === 0 && r.gross_sell === 0;
    $('#rebalanceOutput').innerHTML = `<dl class="metric-grid">${metric('總資產', twd(r.total_value))}${metric('投資部位', twd(r.current_invest_value), `占 ${pct(r.current_invest_ratio)}`)}${metric('目前現金', twd(r.current_cash_value), `占 ${pct(1 - r.current_invest_ratio)}`)}${metric('偏離投資目標', `${r.deviation > 0 ? '+' : ''}${number(r.deviation * 100)} 個百分點`, `觸發門檻：超過 ±${number(p.settings.rebalance_threshold * 100)} 個百分點`)}</dl><div class="allocation-meter" role="img" aria-label="目前投資 ${pct(r.current_invest_ratio)}，目標 ${pct(r.target_invest_ratio)}"><span style="width:${r.current_invest_ratio * 100}%"></span><i style="left:clamp(0px, ${r.target_invest_ratio * 100}%, calc(100% - 2px))"></i></div><div class="meter-labels"><span>深色：投資部位</span><span>標線：目標 ${pct(r.target_invest_ratio)}</span><span>其餘：現金</span></div><div class="notice ${r.should_rebalance ? 'alert' : ''}"><strong>${r.should_rebalance ? `已超過門檻，建議淨${direction} ${twd(Math.abs(r.suggested_total_trade))}` : '目前不需再平衡'}</strong><p>${exact ? '投資、現金與各商品均符合目標配置。' : r.should_rebalance ? `回到精確目標後：投資 ${twd(r.target_invest_value)}、現金 ${twd(r.target_cash_value)}。各商品可能同時有買進與賣出，明細如下。` : `若希望立即恢復精確配置，${r.potential_trade_to_exact_target ? `可考慮淨${direction} ${twd(Math.abs(r.potential_trade_to_exact_target))}` : '可參考下方商品間的調整金額'}。這是選擇性的理論試算，目前未觸發交易建議。`}</p></div>${!exact ? `<details ${r.should_rebalance ? 'open' : ''}><summary>${r.should_rebalance ? '建議交易明細' : '若要回到精確目標：理論交易明細'}（TWD）</summary>${tradeTable(r.potential_trades)}<p class="help">總買進 ${twd(r.gross_buy)}・總賣出 ${twd(r.gross_sell)}。內部商品偏離不會獨立觸發再平衡；此為金額預覽，尚未換算可交易股數或口數。</p></details>` : ''}<details><summary>本月新增 ${twd(c.contribution)}，可以怎麼分配？</summary><p class="contribution-preview">優先買進：${c.contribution_trades.filter(t => t.amount).map(t => `<strong>${esc(t.symbol)} ${twd(t.amount)}</strong>`).join('、') || '無'}；新增資金留作現金：${twd(c.cash_retained)}。</p><p class="help">投入後投資 ${twd(c.after_contribution.current_invest_value)}、現金 ${twd(c.after_contribution.current_cash_value)}。${c.after_contribution.should_rebalance ? '投入後仍超過門檻，另需評估既有資金的再平衡。' : '投入後未超過門檻。'}這是預覽，不會改寫目前持倉。</p></details>`;
  } catch (error) { errorAt('#portfolioError', error); $('#rebalanceOutput').replaceChildren(); }
}
function invalidateSimulation() { simulation = null; $('#simulationOutput').hidden = true; $('#simulationStatus').textContent = '設定已變更，請重新計算情境。'; errorAt('#simulationError', null); }
function portfolioChanged() { capturePortfolio(); updatePreview(); invalidateSimulation(); saveSoon(); }
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', event => {
  if (event.target.hasAttribute('data-twd-native')) {
    const direction = Math.sign(Number(event.target.value));
    event.target.value = '0';
    if (direction) stepTwd(event.target.parentElement.querySelector('[data-twd]'), direction);
    return;
  }
  if (event.target.hasAttribute('data-twd') && !event.isComposing) formatTwd(event.target);
  portfolioChanged();
});
form.addEventListener('compositionend', event => { if (event.target.hasAttribute('data-twd')) { formatTwd(event.target); portfolioChanged(); } });
form.addEventListener('keydown', event => { if (event.target.hasAttribute('data-twd') && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); stepTwd(event.target, event.key === 'ArrowUp' ? 1 : -1); } });
form.addEventListener('beforeinput', event => {
  const input = event.target;
  if (!input.hasAttribute('data-twd') || input.selectionStart !== input.selectionEnd) return;
  const pos = input.selectionStart;
  if (event.inputType === 'deleteContentBackward' && input.value[pos - 1] === ',') input.setSelectionRange(pos - 2, pos);
  if (event.inputType === 'deleteContentForward' && input.value[pos] === ',') input.setSelectionRange(pos, pos + 2);
});
// Form-associated simulation fields live outside the form element.
document.querySelectorAll('[form="portfolioForm"]').forEach(el => el.addEventListener('input', portfolioChanged));
$('#addAsset').addEventListener('click', () => {
  capturePortfolio();
  if (state.portfolioDraft.assets.length >= 50) return errorAt('#portfolioError', '最多 50 項商品');
  state.portfolioDraft.assets.push({ id: crypto.randomUUID(), symbol: '', name: '', type: 'ETF', currency: 'TWD', value: '0', weight: '0', annual: '0' });
  renderAssetEditor(); updatePreview(); invalidateSimulation(); saveSoon(); $('#assetEditor').lastElementChild.querySelector('input').focus();
});
$('#assetEditor').addEventListener('click', event => {
  const button = event.target.closest('.delete-asset'); if (!button) return;
  capturePortfolio(); const i = [...$('#assetEditor').children].indexOf(button.parentElement);
  removedAsset = { asset: state.portfolioDraft.assets[i], index: i }; state.portfolioDraft.assets.splice(i, 1);
  renderAssetEditor(); updatePreview(); invalidateSimulation(); $('#undoAsset').hidden = false; saveSoon(); $('#addAsset').focus();
});
$('#undoAsset').addEventListener('click', () => {
  if (!removedAsset || state.portfolioDraft.assets.length >= 50) return;
  capturePortfolio(); state.portfolioDraft.assets.splice(removedAsset.index, 0, removedAsset.asset); removedAsset = null;
  $('#undoAsset').hidden = true; renderAssetEditor(); updatePreview(); invalidateSimulation(); saveSoon();
});
$('#exportPortfolio').addEventListener('click', () => { try { capturePortfolio(); download('portfolio.json', JSON.stringify(toPortfolio(), null, 2)); errorAt('#importError', null); } catch (e) { errorAt('#importError', e); } });
async function readFile(input, max = 2_000_000) {
  const file = input.files[0]; if (!file) return null;
  if (file.size > max) throw Error('檔案過大，請使用 2 MB 以下的文字檔'); return file.text();
}
$('#importPortfolio').addEventListener('change', async event => {
  try { const text = await readFile(event.target); if (text === null) return; const draft = draftFromPortfolio(JSON.parse(text)); if (!confirm('以匯入配置取代目前的組合設定？專案筆記不受影響。')) return; state.portfolioDraft = draft; removedAsset = null; $('#undoAsset').hidden = true; hydratePortfolio(); invalidateSimulation(); persist(); errorAt('#importError', null); }
  catch (e) { errorAt('#importError', e); } finally { event.target.value = ''; }
});

function chart(rows) {
  const width = Math.max(288, $('#growthChart').parentElement.clientWidth), height = width < 640 ? 240 : 300, left = 64, right = 20, top = 18, bottom = 36;
  $('#growthChart').setAttribute('viewBox', `0 0 ${width} ${height}`);
  const max = Math.max(...rows.map(r => Math.max(r.total_value, r.total_principal))) * 1.08;
  const x = m => left + m / rows.at(-1).month * (width - left - right);
  const y = v => height - bottom - v / max * (height - top - bottom);
  const line = key => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.month).toFixed(2)},${y(r[key]).toFixed(2)}`).join(' ');
  const grids = [0, 1, 2, 3, 4].map(i => { const v = max * i / 4; return `<line class="chart-grid" x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 9}" y="${y(v) + 4}" text-anchor="end">${number(v / 10000)}萬</text>`; }).join('');
  const ticks = [0, .25, .5, .75, 1].map(v => `<text x="${x(rows.at(-1).month * v)}" y="${height - 10}" text-anchor="middle">${number(rows.at(-1).month / 12 * v)} 年</text>`).join('');
  $('#growthChart').innerHTML = `<title id="chartTitle">固定報酬假設的資產情境</title><desc id="chartDesc">第 ${rows.at(-1).month / 12} 年總資產 ${twd(rows.at(-1).total_value)}、累積本金 ${twd(rows.at(-1).total_principal)}。完整數字可下載逐月 CSV。</desc>${grids}${ticks}<path class="chart-principal" d="${line('total_principal')}"/><path class="chart-total" d="${line('total_value')}"/>`;
}
$('#runSimulation').addEventListener('click', () => {
  try {
    capturePortfolio(); const p = toPortfolio(); const initial = previewRebalance(portfolioInput(p)).total_value;
    simulation = simulatePortfolio({ ...p.settings, initial_portfolio_value: initial, cash_annual_return: p.settings.cash_annual_return, assets: p.assets, simulation: { method: 'deterministic_monthly', return_conversion: 'effective_monthly', contribution_timing: 'end_of_month', rebalance_mode: 'threshold', rebalance_threshold: p.settings.rebalance_threshold } });
    const s = simulation.summary;
    $('#simulationSummary').innerHTML = `<dl class="metric-grid">${metric('期末情境總資產', twd(s.projected_final_value))}${metric('累積本金', twd(s.total_principal), `初始 ${twd(s.initial_value)} ＋ 新投入 ${twd(s.total_contributions)}`)}${metric('情境損益', twd(s.projected_profit), '已扣除初始資產及新增本金')}${metric('模擬期間', `${p.settings.simulation_years} 年`, `${simulation.monthly_results.filter(r => r.rebalance_executed).length} 次門檻再平衡`)}</dl>`;
    $('#yearlyRows').innerHTML = simulation.monthly_results.filter(r => r.month % 12 === 0).map(r => `<tr><td>${r.month / 12}</td><td>${number(r.total_value)}</td><td>${number(r.total_principal)}</td><td>${number(r.investment_profit)}</td><td>${pct(r.cash_ratio)}</td><td>${simulation.monthly_results.filter(m => m.month > r.month - 12 && m.month <= r.month && m.rebalance_executed).length} 次</td></tr>`).join('');
    $('#simulationOutput').hidden = false; chart(simulation.monthly_results); $('#simulationStatus').textContent = '情境已依目前設定計算；第 0 月依目標配置初始化。'; errorAt('#simulationError', null); persist();
  } catch (e) { simulation = null; $('#simulationOutput').hidden = true; errorAt('#simulationError', e); }
});
const csvCell = value => '"' + String(value).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""') + '"';
new ResizeObserver(() => { if (simulation && !$('#simulationOutput').hidden && !$('#allocation').hidden) chart(simulation.monthly_results); }).observe($('.growth-figure'));
$('#exportSimulation').addEventListener('click', () => {
  if (!simulation) return;
  const fields = ['month', 'total_value', 'invest_value', 'cash_value', 'cash_ratio', 'cumulative_contributions', 'total_principal', 'investment_profit', 'rebalance_executed'];
  download('portfolio-monthly.csv', '\uFEFF' + [fields.join(','), ...simulation.monthly_results.map(r => fields.map(k => csvCell(r[k])).join(','))].join('\r\n'), 'text/csv;charset=utf-8');
});

const optionMap = { symbol: ['settings', 'symbol'], lookback: ['settings', 'lookback'], drawdown: ['settings', 'drawdown_percent'], days: ['settings', 'days_to_expiry'], otm: ['settings', 'otm_percent'], mode: ['observation', 'mode'], current: ['observation', 'current_price'], high: ['observation', 'high_price'], highDate: ['observation', 'high_date'], quoteTime: ['observation', 'quoted_at'], contracts: ['position', 'contracts'], strike: ['position', 'strike'], expiration: ['position', 'expiration'], buy: ['position', 'buy_premium'], premium: ['position', 'current_premium'], premiumTime: ['position', 'quoted_at'], take: ['position', 'take_profit_percent'], stop: ['position', 'stop_loss_percent'] };
function captureOptions() {
  for (const [name, [group, key]] of Object.entries(optionMap)) {
    const input = optionForm.elements.namedItem(name), value = input.value;
    state.options[group][key] = input.type === 'number' || name === 'lookback' ? value === '' ? '' : Number(value) : value;
  }
  state.options.history_csv = optionForm.elements.history.value; state.options.qqq_price = optionForm.elements.qqq.value;
}
function optionMode() { $('#manualHigh').hidden = optionForm.elements.mode.value !== 'manual'; $('#csvHigh').hidden = optionForm.elements.mode.value !== 'csv'; }
function hydrateOptions() {
  for (const [name, [group, key]] of Object.entries(optionMap)) optionForm.elements.namedItem(name).value = state.options[group][key];
  optionForm.elements.history.value = state.options.history_csv; optionForm.elements.qqq.value = state.options.qqq_price; optionMode();
}
function clearOptionResults() { for (const key of ['signal', 'contract', 'position']) { $(`#${key}Output`).replaceChildren(); errorAt(`#${key}Error`, null); } }
optionForm.addEventListener('submit', e => e.preventDefault());
optionForm.addEventListener('input', event => {
  if (event.target.name === 'symbol') {
    for (const name of ['current', 'high', 'highDate', 'quoteTime', 'history']) optionForm.elements.namedItem(name).value = '';
  }
  if (event.target.name === 'lookback' && optionForm.elements.mode.value === 'manual') { optionForm.elements.high.value = ''; optionForm.elements.highDate.value = ''; }
  captureOptions(); optionMode(); clearOptionResults(); saveSoon();
});
$('#importCloses').addEventListener('change', async event => {
  try { const text = await readFile(event.target, 1_000_000); if (text === null) return; parseCloseCSV(text); optionForm.elements.history.value = text; captureOptions(); clearOptionResults(); persist(); }
  catch (e) { errorAt('#signalError', e); } finally { event.target.value = ''; }
});
$('#csvTemplate').addEventListener('click', () => download('daily-close-template.csv', 'date,close\r\n2026-01-02,100.25\r\n2026-01-05,101.50\r\n', 'text/csv;charset=utf-8'));
$('#checkSignal').addEventListener('click', () => {
  try {
    captureOptions(); const o = state.options, r = evaluateSignal(o.settings, o.observation, o.observation.mode === 'csv' ? parseCloseCSV(o.history_csv) : []);
    const key = `${r.symbol}:${r.lookback}:${r.threshold_percent}`;
    const previous = state.signals[key];
    let headline = r.condition_met ? '已達回落門檻，進場條件符合' : '尚未達到回落門檻';
    if (r.stale) headline = '這筆報價已超過 15 分鐘，請更新後再確認';
    else if (r.condition_met && previous?.met) headline = '同一次回落已提醒，條件仍符合';
    if (!r.stale) state.signals[key] = { met: r.condition_met, at: r.quoted_at };
    $('#signalOutput').innerHTML = `<div class="notice ${r.condition_met || r.stale ? 'alert' : ''}"><strong>${headline}</strong><p>這是依輸入資料比對策略條件的結果，尚未驗證策略有效性。${r.stale ? '以下只呈現舊報價的計算結果。' : '價格回到門檻以上，才會解除這次提醒狀態。'}</p></div><dl class="metric-grid">${metric(`${r.symbol} 目前價格`, number(r.current_price))}${metric('觀察期間最高收盤價', number(r.high_price), r.high_date)}${metric('相對高點回落', `${number(r.drawdown_percent)}%`, `門檻 ${r.threshold_percent}%`)}${metric('門檻價格', number(r.trigger_price))}</dl><p class="help">報價時間：${esc(new Date(r.quoted_at).toLocaleString('zh-TW'))}（本地）・美東日期 ${r.market_date}。${r.source === 'manual' ? '高點為手動輸入，尚未驗證是否涵蓋所選交易日期間。' : `採用 ${r.from_date} 起最近 ${r.sample_count} 筆已完成交易日收盤資料；請自行確認資料完整。`}</p>`;
    errorAt('#signalError', null); persist();
  } catch (e) { $('#signalOutput').replaceChildren(); errorAt('#signalError', e); }
});
$('#checkContract').addEventListener('click', () => {
  try { captureOptions(); const o = state.options, g = contractGuide(o.qqq_price, o.settings.days_to_expiry, o.settings.otm_percent);
    $('#contractOutput').innerHTML = `<div class="notice"><strong>參考履約價 US$${number(g.reference_strike)}・參考到期日 ${g.reference_expiration}</strong><p>以目前美東日期加 ${g.days} 個曆日，QQQ 價外 ${g.otm_percent}% 計算。請在券商尋找接近此條件的實際合約。</p></div>`; errorAt('#contractError', null); persist();
  } catch (e) { $('#contractOutput').replaceChildren(); errorAt('#contractError', e); }
});
$('#checkPosition').addEventListener('click', () => {
  try { captureOptions(); const r = evaluatePosition(state.options.position);
    let headline = '尚未觸及停利或停損條件';
    if (r.take_profit_met) headline = r.take_profit_contracts ? `已達停利條件，依整數口數預覽可賣出 ${r.take_profit_contracts} 口` : '已達停利條件，但 1 口無法平倉一半';
    if (r.stop_loss_met) headline = `已達停損條件，策略設定為平倉全部 ${state.options.position.contracts} 口`;
    if (r.expired) headline = '合約到期日已過，請至券商確認持倉及結算狀態';
    if (r.stale && !r.expired) headline = '權利金報價已超過 15 分鐘，請更新後再確認';
    $('#positionOutput').innerHTML = `<div class="notice ${r.take_profit_met || r.stop_loss_met || r.expired || r.stale ? 'alert' : ''}"><strong>${headline}</strong><p>${r.stale ? '以下為舊報價試算。' : ''}${r.take_profit_met && !r.exactly_half ? '奇數口數無法精確平倉一半；向下取整的數量僅供預覽，實際賣出數量需自行確認。' : ''}${r.days_to_expiry <= 7 ? '距到期日很近或已過期，請確認券商的行權、資金與平倉安排。' : ''}</p></div><dl class="metric-grid">${metric('權利金報酬', `${r.pnl_percent > 0 ? '+' : ''}${number(r.pnl_percent)}%`)}${metric('未實現損益', usd(r.unrealized_pnl_usd), '未含費用')}${metric('投入權利金', usd(r.cost_usd), '持有 Call 的權利金可能全部損失')}${metric('距到期日', `${r.days_to_expiry} 天`, r.expiration)}</dl><p class="help">停利權利金 ${usd(r.take_price)}／股・停損權利金 ${usd(r.stop_price)}／股・到期損益兩平價 ${usd(r.break_even_at_expiry)}（未含費用，非到期前的停利價）。報價時間 ${esc(new Date(r.quoted_at).toLocaleString('zh-TW'))}。提醒不會送出委託或更動口數。</p>`;
    errorAt('#positionError', null); persist();
  } catch (e) { $('#positionOutput').replaceChildren(); errorAt('#positionError', e); }
});

function selectTab(name, focus = false) {
  for (const tab of ['allocation', 'options']) { const selected = tab === name; $(`#tab-${tab}`).setAttribute('aria-selected', String(selected)); $(`#tab-${tab}`).tabIndex = selected ? 0 : -1; $(`#${tab}`).hidden = !selected; }
  if (focus) $(`#tab-${name}`).focus();
}
document.querySelectorAll('[role=tab]').forEach(button => {
  button.addEventListener('click', () => { const tab = button.id.slice(4); selectTab(tab); history.replaceState(null, '', '#' + tab); });
  button.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const tab = event.key === 'Home' ? 'allocation' : event.key === 'End' ? 'options' : button.id === 'tab-allocation' ? 'options' : 'allocation'; selectTab(tab, true); history.replaceState(null, '', '#' + tab); } });
});
window.addEventListener('hashchange', () => selectTab(location.hash === '#options' ? 'options' : 'allocation'));
$('#backupAll').addEventListener('click', () => { capturePortfolio(); captureOptions(); download(locked && rawSaved ? 'investment-original.json' : 'investment-toolkit-backup.json', locked && rawSaved ? rawSaved : JSON.stringify({ ...state, saved_at: new Date().toISOString() }, null, 2)); });
$('#restoreAll').addEventListener('change', async event => {
  try { const text = await readFile(event.target); if (text === null) return; const restored = validateState(JSON.parse(text)); if (!confirm('以完整備份取代目前工具資料？建議先下載目前備份。專案筆記不受影響。')) return; state = restored; locked = false; removedAsset = null; $('#undoAsset').hidden = true; hydratePortfolio(); hydrateOptions(); clearOptionResults(); invalidateSimulation(); persist(); errorAt('#importError', null); }
  catch (e) { errorAt('#importError', e); selectTab('allocation'); } finally { event.target.value = ''; }
});
$('#resetAll').addEventListener('click', () => {
  if (!confirm('重設此工具的配置、期權資料與提醒紀錄？專案筆記會保留。請先下載需要的備份。')) return;
  state = initialState(); locked = false; rawSaved = null; removedAsset = null; $('#undoAsset').hidden = true;
  hydratePortfolio(); hydrateOptions(); clearOptionResults(); invalidateSimulation(); persist();
});
window.addEventListener('pagehide', () => { if (timer) persist(); });
window.addEventListener('beforeunload', event => { if (timer) persist(); if (dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) persist(); });
hydratePortfolio(); hydrateOptions(); selectTab(location.hash === '#options' ? 'options' : 'allocation');
storageStatus(locked ? '原資料無法讀取，以下暫用範例；儲存已停用，可下載原始備份。' : rawSaved ? '已讀取此瀏覽器儲存的工具資料。' : '預填討論範例；修改後自動儲存在此瀏覽器。', locked);
