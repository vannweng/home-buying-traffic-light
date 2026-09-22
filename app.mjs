import { comparePrice, getProjects, summarizeProject } from './price-engine.mjs';

const $ = (selector) => document.querySelector(selector);
const number = (value, digits = 1) => Number(value).toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
let transactions = [];
let projects = [];
let selected = null;
let snapshot = null;
let selectedNames = new Set();
const watchStorageKey = 'zhonghe-watchlist-v1';
let watchNames = [];

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function saveWatchlist() {
  try { localStorage.setItem(watchStorageKey, JSON.stringify(watchNames)); }
  catch { $('#watchStatus').textContent = '瀏覽器無法儲存列表；重新整理後可能需要再次加入。'; }
}

function watchMetric(label, value, detail = '') {
  const metric = element('div', 'watch-metric');
  metric.append(element('span', '', label), element('strong', '', value));
  if (detail) metric.append(element('small', '', detail));
  return metric;
}

function renderWatchlist() {
  const list = $('#watchList');
  list.replaceChildren();
  $('#watchCount').textContent = `${watchNames.length} 個建案`;
  if (!watchNames.length) {
    list.append(element('p', 'watch-empty', '列表目前是空的。從上方挑選建案，即可把它加入追蹤。'));
    return;
  }
  const signalLabels = { green: '便宜', amber: '合理', red: '昂貴', neutral: '資料不足' };
  for (const name of watchNames) {
    const summary = summarizeProject({ name, transactions });
    if (!summary) continue;
    const card = element('article', 'watch-card');
    const heading = element('div', 'watch-card-heading');
    const identity = element('div', 'watch-identity');
    identity.append(element('h3', '', name), element('small', '', `${summary.count} 筆近三年成交`));
    const remove = element('button', 'watch-remove', '移除 ×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `從觀察列表移除 ${name}`);
    remove.addEventListener('click', () => {
      watchNames = watchNames.filter((item) => item !== name);
      saveWatchlist();
      renderWatchlist();
      $('#watchStatus').textContent = `已移除「${name}」。`;
    });
    heading.append(identity, remove);
    const latest = element('div', 'watch-latest');
    const latestPrice = element('div', 'watch-latest-price');
    latestPrice.append(element('span', '', '最新一筆成交單價'), element('strong', '', `${number(summary.latest.unitPrice, 1)} 萬／坪`));
    latest.append(latestPrice, element('span', `watch-signal ${summary.signal}`, signalLabels[summary.signal]));
    const bands = element('div', 'watch-bands');
    bands.append(
      watchMetric('便宜界線', summary.cheapMax === null ? '—' : `≤ ${number(summary.cheapMax, 1)}`, '萬／坪'),
      watchMetric('合理參考價', summary.reasonablePrice === null ? '—' : number(summary.reasonablePrice, 1), '萬／坪（中位數）'),
      watchMetric('昂貴界線', summary.expensiveMin === null ? '—' : `≥ ${number(summary.expensiveMin, 1)}`, '萬／坪'),
    );
    const averages = element('div', 'watch-averages');
    averages.append(
      watchMetric('三年平均單價', summary.averageUnitPrice === null ? '—' : `${number(summary.averageUnitPrice, 1)} 萬／坪`),
      watchMetric('三年平均總價', summary.averageTotalPrice === null ? '—' : `${number(summary.averageTotalPrice, 0)} 萬`),
      watchMetric('三年平均房屋坪數', summary.averageHomeArea === null ? '—' : `${number(summary.averageHomeArea, 1)} 坪`),
    );
    const foot = element('p', 'watch-foot', `最新交易日期 ${summary.latest.date} · 最新成交總價 ${number(summary.latest.totalPrice, 0)} 萬（含車位時依登錄原價）`);
    card.append(heading, latest, bands, averages, foot);
    if (summary.count < 5) card.append(element('p', 'watch-low-data', summary.count === 0 ? '近三年沒有符合條件的成交，暫不判燈。' : '近三年成交少於 5 筆，價格界線與燈號暫不顯示。'));
    list.append(card);
  }
}

function resetResult() {
  $('#resultEmpty').hidden = false;
  $('#resultContent').hidden = true;
}

function setSearchOpen(isOpen) {
  $('#projectOptions').hidden = !isOpen;
  $('#projectSearch').setAttribute('aria-expanded', String(isOpen));
}

function projectOption(project) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'project-option';
  button.setAttribute('role', 'option');
  const main = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = project.name;
  const address = document.createElement('small');
  address.textContent = `${project.address} · 最近成交 ${project.latest}`;
  const count = document.createElement('em');
  count.textContent = `${project.count} 筆`;
  main.append(name, address);
  button.append(main, count);
  button.addEventListener('click', () => chooseProject(project));
  return button;
}

function renderSearch() {
  const query = $('#projectSearch').value.trim().toLocaleLowerCase('zh-Hant');
  const matches = projects.filter((project) => `${project.name} ${project.street} ${project.address}`.toLocaleLowerCase('zh-Hant').includes(query)).slice(0, 12);
  const options = $('#projectOptions');
  options.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'field-hint';
    empty.style.padding = '8px 13px';
    empty.textContent = '沒有找到建案。此版僅收錄中和區已有公開預售成交的建案。';
    options.append(empty);
  } else {
    for (const project of matches) options.append(projectOption(project));
  }
  setSearchOpen(true);
}

function chooseProject(project) {
  selected = project;
  selectedNames = new Set();
  resetResult();
  $('#selectedName').textContent = project.name;
  $('#selectedAddress').textContent = project.address;
  $('#selectedProject').hidden = false;
  $('#projectSearch').value = project.name;
  setSearchOpen(false);
  $('#askingUnit').focus();
}

function makeCandidate(candidate, included) {
  const item = document.createElement('div');
  item.className = `case-item ${included ? 'is-included' : ''}`;
  const main = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = candidate.name;
  const detail = document.createElement('small');
  detail.textContent = `${candidate.sameStreet ? '同一路名' : '中和區內'} · 首次成交 ${candidate.first.slice(0, 4)} 年 · ${candidate.cases.length} 筆相近坪數成交`;
  const price = document.createElement('b');
  price.textContent = `${number(candidate.baseline, 1)} 萬 / 坪`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'compare-button';
  button.textContent = included ? '✓ 已加入' : '＋ 加入比較';
  button.setAttribute('aria-pressed', String(included));
  button.addEventListener('click', () => {
    if (selectedNames.has(candidate.name)) selectedNames.delete(candidate.name);
    else selectedNames.add(candidate.name);
    calculateAndRender();
  });
  main.append(name, detail);
  item.append(main, price, button);
  return item;
}

function calculateAndRender() {
  const askingUnit = Number($('#askingUnit').value);
  const area = Number($('#targetArea').value);
  const yearTolerance = Number($('#vintageTolerance').value);
  const result = comparePrice({ project: selected, projects, transactions, askingUnit, area, selectedNames: [...selectedNames], yearTolerance });
  selectedNames = new Set(result.selected.map((candidate) => candidate.name));
  renderResult(result, askingUnit, yearTolerance);
}

function renderResult(result, askingUnit, yearTolerance) {
  $('#resultEmpty').hidden = true;
  $('#resultContent').hidden = false;
  $('#resultDate').textContent = `資料快照 ${snapshot.generatedAt}`;
  $('#resultProject').textContent = selected.name;
  $('#signalLamp').className = `signal-lamp ${result.signal}`;
  $('#askingDisplay').textContent = number(askingUnit, 1);
  $('#baselineDisplay').textContent = result.baseline === null ? '—' : number(result.baseline, 1);
  $('#differenceDisplay').textContent = result.difference === null ? '—' : `${result.difference > 0 ? '+' : ''}${number(result.difference, 1)}%`;
  const titles = { green: '綠燈 · 低於成交基準', amber: '黃燈 · 接近或高於基準', red: '紅燈 · 高出基準逾 15%', neutral: result.candidates.length < 3 ? '資料不足 · 暫不判燈' : '待選三案 · 暫不判燈' };
  const messages = {
    green: '這個開價低於可比成交案例的中位數。請繼續確認樓層、車位與付款條件。',
    amber: '這個開價介於成交基準與高出 15% 之間，值得帶著案例進一步議價。',
    red: '開價明顯高於可比成交案例。建議先確認差異原因，再決定出價。',
    neutral: result.candidates.length < 3 ? '目前符合條件的不同建案不足三個，可調整年份差距或所看坪數。' : '請在下方加入至少三個不同的可比建案；不足三案時不提供紅黃綠燈。',
  };
  $('#signalTitle').textContent = titles[result.signal];
  $('#signalDescription').textContent = messages[result.signal];
  $('#confidenceNote').textContent = result.selected.length >= 3
    ? `已用 ${result.selected.length} 個不同建案計算；每案先取自身成交中位數，再由各案中位數產生比較基準。`
    : `目前加入 ${result.selected.length} 案，至少需要 3 個不同建案。預售屋以首次公開成交年份代表案齡，並非完工屋齡。`;
  $('#casesCount').textContent = `${result.selected.length} / 3 已加入`;
  $('#casesSummary').textContent = `候選案首次成交年份與「${selected.name}」相差不超過 ${yearTolerance} 年、建物類型相同、房屋坪數相差不超過 25%，且近三年有成交。同一路名排在前面；區內其他路段不代表基地緊鄰。`;
  $('#comparisonStatus').textContent = result.candidates.length < 3
    ? `目前只有 ${result.candidates.length} 個符合條件的不同建案；可改選前後年份或房屋坪數。資料不足時不亮燈。`
    : result.selected.length < 3
      ? `從下方 ${result.candidates.length} 個候選建案加入比較，還需選 ${3 - result.selected.length} 案。`
      : `已選 ${result.selected.length} 案。點擊「已加入」可移除，燈號會立即重算。`;
  $('#caseList').replaceChildren(...result.candidates.map((candidate) => makeCandidate(candidate, selectedNames.has(candidate.name))));
  $('#mapsLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address + ' ' + selected.name)}`;
}

$('#projectSearch').addEventListener('focus', () => { if (projects.length) renderSearch(); });
$('#projectSearch').addEventListener('input', () => { selected = null; selectedNames = new Set(); resetResult(); $('#selectedProject').hidden = true; renderSearch(); });
$('#projectSearch').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSearchOpen(false);
  if (event.key === 'Enter' && !$('#projectOptions').hidden) {
    const first = $('#projectOptions .project-option');
    if (first) { event.preventDefault(); first.click(); }
  }
});
$('#clearSearch').addEventListener('click', () => { $('#projectSearch').value = ''; selected = null; selectedNames = new Set(); resetResult(); $('#selectedProject').hidden = true; $('#projectSearch').focus(); renderSearch(); });
$('#changeProject').addEventListener('click', () => { $('#projectSearch').focus(); $('#projectSearch').select(); renderSearch(); });
document.addEventListener('click', (event) => { if (!event.target.closest('.search-wrap, .project-options')) setSearchOpen(false); });
$('#askingUnit').addEventListener('input', resetResult);
$('#targetArea').addEventListener('input', () => { selectedNames = new Set(); resetResult(); });
$('#vintageTolerance').addEventListener('change', () => { if (selected && $('#resultContent').hidden === false) calculateAndRender(); });
$('#priceForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selected) { $('#projectSearch').focus(); renderSearch(); return; }
  if (!event.currentTarget.reportValidity()) return;
  calculateAndRender();
  if (window.innerWidth < 900) $('#resultContent').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#addWatchProject').addEventListener('click', () => {
  const name = $('#watchProject').value;
  if (!name || !projects.some((project) => project.name === name)) {
    $('#watchStatus').textContent = '請先選一個建案。';
    return;
  }
  if (watchNames.includes(name)) {
    $('#watchStatus').textContent = `「${name}」已在列表中。`;
    return;
  }
  watchNames.push(name);
  saveWatchlist();
  renderWatchlist();
  $('#watchStatus').textContent = `已加入「${name}」。`;
});

try {
  const response = await fetch('./data/zhonghe-presale.json');
  if (!response.ok) throw new Error('資料檔無法讀取');
  snapshot = await response.json();
  transactions = snapshot.transactions;
  projects = getProjects(transactions);
  $('#watchProject').replaceChildren(element('option', '', '請選擇建案'));
  $('#watchProject').firstElementChild.value = '';
  for (const project of [...projects].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))) {
    const option = element('option', '', project.name);
    option.value = project.name;
    $('#watchProject').append(option);
  }
  try {
    const saved = JSON.parse(localStorage.getItem(watchStorageKey) || '[]');
    if (Array.isArray(saved)) watchNames = [...new Set(saved.filter((name) => typeof name === 'string' && projects.some((project) => project.name === name)))];
  } catch { watchNames = []; }
  renderWatchlist();
  $('#dataStatus').textContent = `收錄 ${projects.length} 個建案、${transactions.length} 筆符合條件的成交 · 最新成交 ${snapshot.latestTransaction}`;
  $('#sourceFreshness').textContent = `新北市政府地政局預售屋實價 · 快照 ${snapshot.generatedAt} · 最新成交 ${snapshot.latestTransaction}`;
} catch (error) {
  $('#dataStatus').textContent = '資料載入失敗。請依 README 使用本機網頁伺服器開啟，或稍後重試。';
  $('#watchStatus').textContent = '建案資料載入失敗，列表暫時無法使用。';
  console.error(error);
}
