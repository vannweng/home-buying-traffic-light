import { comparePrice, getProjects } from './price-engine.mjs';

const $ = (selector) => document.querySelector(selector);
const number = (value, digits = 1) => Number(value).toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
let transactions = [];
let projects = [];
let selected = null;
let snapshot = null;

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
  resetResult();
  $('#selectedName').textContent = project.name;
  $('#selectedAddress').textContent = project.address;
  $('#selectedProject').hidden = false;
  $('#projectSearch').value = project.name;
  setSearchOpen(false);
  $('#askingUnit').focus();
}

function makeCase(row) {
  const item = document.createElement('div');
  item.className = 'case-item';
  const name = document.createElement('strong');
  name.textContent = row.name;
  const price = document.createElement('b');
  price.textContent = `${number(row.unitPrice, 1)} 萬`;
  const detail = document.createElement('small');
  detail.textContent = `${row.date} 成交 · 房屋 ${number(row.homeArea, 1)} 坪 · ${row.floor || row.type} · ${row.street}`;
  item.append(name, price, detail);
  return item;
}

function renderResult(result, askingUnit) {
  $('#resultEmpty').hidden = true;
  $('#resultContent').hidden = false;
  $('#resultDate').textContent = `資料快照 ${snapshot.generatedAt}`;
  $('#resultProject').textContent = selected.name;
  $('#signalLamp').className = `signal-lamp ${result.signal}`;
  $('#askingDisplay').textContent = number(askingUnit, 1);
  $('#baselineDisplay').textContent = result.baseline === null ? '—' : number(result.baseline, 1);
  $('#differenceDisplay').textContent = result.difference === null ? '—' : `${result.difference > 0 ? '+' : ''}${number(result.difference, 1)}%`;
  const titles = { green: '綠燈 · 低於成交基準', amber: '黃燈 · 接近或高於基準', red: '紅燈 · 高出基準逾 15%', neutral: '資料不足 · 暫不判燈' };
  const messages = {
    green: '這個開價低於可比成交案例的中位數。請繼續確認樓層、車位與付款條件。',
    amber: '這個開價介於成交基準與高出 15% 之間，值得帶著案例進一步議價。',
    red: '開價明顯高於可比成交案例。建議先確認差異原因，再決定出價。',
    neutral: '近兩年找不到至少三筆同類型、坪數相近的可比成交，無法可靠判讀。',
  };
  $('#signalTitle').textContent = titles[result.signal];
  $('#signalDescription').textContent = messages[result.signal];
  $('#confidenceNote').textContent = result.mode === 'same-street'
    ? `比較同一路名「${selected.street}」其他建案的 ${result.cases.length} 筆近期成交；路名相同不保證基地緊鄰。`
    : result.mode === 'same-project'
      ? `同一路名其他建案的可比案例不足，因此改用「${selected.name}」自身的 ${result.cases.length} 筆近期成交。`
      : `同路名其他建案 ${result.available.street} 筆；同建案 ${result.available.project} 筆。每組至少需要 3 筆才給燈號。`;
  $('#casesCount').textContent = `${result.cases.length} 筆比較`;
  $('#casesSummary').textContent = result.mode === 'insufficient'
    ? '可前往官方網站查看更廣範圍的交易，或調整所看的房屋坪數後再試。'
    : `同類型、房屋坪數相差不超過 25%、成交距今不超過兩年。基準採以下 ${result.cases.length} 筆的每坪單價中位數。`;
  $('#caseList').replaceChildren(...result.cases.slice(0, 8).map(makeCase));
  if (result.cases.length > 8) $('#casesSummary').textContent += ' 下方列出最近 8 筆。';
  $('#mapsLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address + ' ' + selected.name)}`;
  if (window.innerWidth < 900) $('#resultContent').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#projectSearch').addEventListener('focus', () => { if (projects.length) renderSearch(); });
$('#projectSearch').addEventListener('input', () => { selected = null; resetResult(); $('#selectedProject').hidden = true; renderSearch(); });
$('#projectSearch').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSearchOpen(false);
  if (event.key === 'Enter' && !$('#projectOptions').hidden) {
    const first = $('#projectOptions .project-option');
    if (first) { event.preventDefault(); first.click(); }
  }
});
$('#clearSearch').addEventListener('click', () => { $('#projectSearch').value = ''; selected = null; resetResult(); $('#selectedProject').hidden = true; $('#projectSearch').focus(); renderSearch(); });
$('#changeProject').addEventListener('click', () => { $('#projectSearch').focus(); $('#projectSearch').select(); renderSearch(); });
document.addEventListener('click', (event) => { if (!event.target.closest('.search-wrap, .project-options')) setSearchOpen(false); });
$('#askingUnit').addEventListener('input', resetResult);
$('#targetArea').addEventListener('input', resetResult);
$('#priceForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selected) { $('#projectSearch').focus(); renderSearch(); return; }
  if (!event.currentTarget.reportValidity()) return;
  const askingUnit = Number($('#askingUnit').value);
  const area = Number($('#targetArea').value);
  renderResult(comparePrice({ project: selected, transactions, askingUnit, area }), askingUnit);
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
