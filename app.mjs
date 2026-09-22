import { comparePrice, getProjects } from './price-engine.mjs';

const $ = (selector) => document.querySelector(selector);
const number = (value, digits = 1) => Number(value).toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
let transactions = [];
let projects = [];
let selected = null;
let snapshot = null;
let selectedNames = new Set();

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

try {
  const response = await fetch('./data/zhonghe-presale.json');
  if (!response.ok) throw new Error('資料檔無法讀取');
  snapshot = await response.json();
  transactions = snapshot.transactions;
  projects = getProjects(transactions);
  $('#dataStatus').textContent = `收錄 ${projects.length} 個建案、${transactions.length} 筆符合條件的成交 · 最新成交 ${snapshot.latestTransaction}`;
  $('#sourceFreshness').textContent = `新北市政府地政局預售屋實價 · 快照 ${snapshot.generatedAt} · 最新成交 ${snapshot.latestTransaction}`;
} catch (error) {
  $('#dataStatus').textContent = '資料載入失敗。請依 README 使用本機網頁伺服器開啟，或稍後重試。';
  console.error(error);
}
