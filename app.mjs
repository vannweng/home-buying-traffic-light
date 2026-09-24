import { cheapestComparableNames, comparePrice, findComparableProjects, getProjects, summarizeProject } from './price-engine.mjs';
import { analyzeTrend } from './trend-engine.mjs';
import { CRITERIA, scoreAppreciation } from './appreciation-score.mjs';
import { addLocation, hasCoordinates } from './geo-engine.mjs';
import { officialFutureFacilities } from './future-evidence.mjs';

const $ = (selector) => document.querySelector(selector);
const number = (value, digits = 1) => Number(value).toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
let transactions = [];
let projects = [];
let selected = null;
let snapshot = null;
let selectedNames = new Set();
let comparisonCustomized = false;
const watchStorageKey = 'zhonghe-watchlist-v1';
let watchNames = [];
let trendEvidence = [];
let aiSummaries = {};
let geoSnapshot = {};
const scoreStorageKey = 'zhonghe-appreciation-v1';
let scoreAnswers = {};

$('#top').insertBefore($('#watchlist'), $('#analysisPanel'));
function activateTab(tab, updateHash = true) {
  const watch = tab === 'watchlist';
  const trend = tab === 'trend';
  $('#watchlist').hidden = !watch;
  $('#analysisPanel').hidden = watch || trend;
  $('#method').hidden = watch || trend;
  $('#trendPanel').hidden = !trend;
  $('#tabWatchlist').setAttribute('aria-selected', String(watch));
  $('#tabAnalysis').setAttribute('aria-selected', String(!watch && !trend));
  $('#tabTrend').setAttribute('aria-selected', String(trend));
  $('#tabWatchlist').tabIndex = watch ? 0 : -1;
  $('#tabAnalysis').tabIndex = !watch && !trend ? 0 : -1;
  $('#tabTrend').tabIndex = trend ? 0 : -1;
  if (updateHash) history.replaceState(null, '', watch ? '#watchlist' : trend ? '#trend' : '#analysis');
}
$('#tabWatchlist').addEventListener('click', () => activateTab('watchlist'));
$('#tabAnalysis').addEventListener('click', () => activateTab('analysis'));
$('#tabTrend').addEventListener('click', () => activateTab('trend'));
$('#topAnalysisLink').addEventListener('click', () => activateTab('analysis', false));
$('.page-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [$('#tabWatchlist'), $('#tabAnalysis'), $('#tabTrend')];
  const index = tabs.indexOf(event.target);
  if (index < 0) return;
  const target = tabs[(index + (event.key === 'ArrowRight' ? 1 : 2)) % tabs.length];
  target.click();
  target.focus();
});
activateTab(location.hash === '#trend' ? 'trend' : ['#analysis', '#method'].includes(location.hash) ? 'analysis' : 'watchlist', false);

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

function watchLines(items) {
  const box = element('div', 'watch-lines');
  for (const [label, value] of items) {
    const line = element('div', 'watch-line');
    line.append(element('span', '', label), element('strong', '', value));
    box.append(line);
  }
  return box;
}

function renderWatchlist() {
  const list = $('#watchList');
  list.replaceChildren();
  $('#watchCount').textContent = `${watchNames.length} 個建案`;
  if (!watchNames.length) {
    const row = element('tr', 'watch-empty');
    const cell = element('td', '', '列表目前是空的。從上方挑選建案，即可把它加入追蹤。');
    cell.colSpan = 7;
    row.append(cell);
    list.append(row);
    return;
  }
  const signalLabels = { green: '便宜', amber: '合理', red: '昂貴', neutral: '資料不足' };
  for (const name of watchNames) {
    const summary = summarizeProject({ name, transactions });
    if (!summary) continue;
    const row = element('tr', 'watch-row');
    const cell = (content, className = '') => {
      const td = element('td', className);
      if (typeof content === 'string') td.textContent = content;
      else td.append(content);
      row.append(td);
    };
    const identity = element('div', 'watch-identity');
    identity.append(element('strong', '', name), element('small', '', `${summary.count} 筆成交`));
    cell(identity, 'watch-name-cell');
    const latest = element('strong', 'watch-price', number(summary.latest.unitPrice, 1));
    cell(latest);
    cell(watchLines([
      ['便', summary.cheapMax === null ? '—' : `≤ ${number(summary.cheapMax, 1)}`],
      ['合', summary.reasonablePrice === null ? '—' : number(summary.reasonablePrice, 1)],
      ['貴', summary.expensiveMin === null ? '—' : `≥ ${number(summary.expensiveMin, 1)}`],
    ]));
    cell(element('span', `watch-signal ${summary.signal}`, signalLabels[summary.signal]));
    cell(watchLines([
      ['單價', summary.averageUnitPrice === null ? '—' : `${number(summary.averageUnitPrice, 1)} 萬／坪`],
      ['總價', summary.averageTotalPrice === null ? '—' : `${number(summary.averageTotalPrice, 0)} 萬`],
      ['坪數', summary.averageHomeArea === null ? '—' : `${number(summary.averageHomeArea, 1)} 坪`],
    ]));
    cell(summary.latest.date);
    const remove = element('button', 'watch-remove', '移除');
    remove.type = 'button';
    remove.setAttribute('aria-label', `從觀察列表移除 ${name}`);
    remove.addEventListener('click', () => {
      watchNames = watchNames.filter((item) => item !== name);
      saveWatchlist();
      renderWatchlist();
      $('#watchStatus').textContent = `已移除「${name}」。`;
    });
    cell(remove);
    list.append(row);
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
  comparisonCustomized = false;
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
  detail.textContent = `距離 ${Math.round(candidate.distanceMeters)} 公尺 · 首次成交 ${candidate.first.slice(0, 4)} 年 · ${candidate.cases.length} 筆相近坪數成交`;
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
    comparisonCustomized = true;
    calculateAndRender();
  });
  main.append(name, detail);
  item.append(main, price, button);
  return item;
}

function calculateAndRender(autoSelect = false) {
  const askingUnit = Number($('#askingUnit').value);
  const area = Number($('#targetArea').value);
  const yearTolerance = Number($('#vintageTolerance').value);
  if (autoSelect && !comparisonCustomized) {
    selectedNames = new Set(cheapestComparableNames(findComparableProjects({ project: selected, projects, transactions, area, yearTolerance })));
  }
  const result = comparePrice({ project: selected, projects, transactions, askingUnit, area, selectedNames: [...selectedNames], yearTolerance, minDistanceMeters: 0, maxDistanceMeters: 300 });
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
  const titles = { green: '綠燈 · 低於成交基準', amber: '黃燈 · 接近或高於基準', red: '紅燈 · 高出基準逾 15%', neutral: '黑燈 · 沒有可用成交' };
  const messages = {
    green: '這個開價低於可比成交案例的中位數。請繼續確認樓層、車位與付款條件。',
    amber: '這個開價介於成交基準與高出 15% 之間，值得帶著案例進一步議價。',
    red: '開價明顯高於可比成交案例。建議先確認差異原因，再決定出價。',
    neutral: '本案與已加入建案都沒有近三年、相近坪數的可用成交，因此暫不提供紅黃綠燈。',
  };
  $('#signalTitle').textContent = titles[result.signal];
  $('#signalDescription').textContent = messages[result.signal];
  $('#confidenceNote').textContent = result.benchmarkProjects.length
    ? `已用 ${result.benchmarkProjects.length} 個建案計算${result.own ? '，包含本案自己的成交' : ''}；每案先取自身成交中位數，再由各案中位數產生比較基準。僅一案時可判燈，但更容易受單案條件影響。`
    : '本案與已加入建案都沒有近三年、相近坪數的可用成交。預售屋以首次公開成交年份代表案齡，並非完工屋齡。';
  $('#casesCount').textContent = `${result.selected.length} 案已加入${result.own ? ' · 本案已納入' : ''}`;
  $('#casesSummary').textContent = `本案有符合條件的成交時會自動納入計算；其他候選案預設選入價格中位數最低的最多三案。候選案必須與「${selected.name}」基地直線距離 0–300 公尺，且首次成交年份相差不超過 ${yearTolerance} 年、建物類型相同、房屋坪數相差不超過 25%，近三年有成交。你可改選任意數量。`;
  $('#comparisonStatus').textContent = result.candidates.length === 0
    ? (hasCoordinates(selected) ? '目前沒有 0–300 公尺內且符合條件的不同建案；可調整年份差距或房屋坪數。' : '此建案尚未完成基地定位，暫時無法用距離篩選比較案。')
    : `已選 ${result.selected.length} 案${result.own ? '，本案成交也已自動納入' : ''}。可再加入、移除，或清空比較；燈號會立即重算。`;
  $('#caseList').replaceChildren(...[...result.candidates].sort((a, b) => a.baseline - b.baseline || a.name.localeCompare(b.name, 'zh-Hant')).map((candidate) => makeCandidate(candidate, selectedNames.has(candidate.name))));
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
$('#targetArea').addEventListener('input', () => { selectedNames = new Set(); comparisonCustomized = false; resetResult(); });
$('#vintageTolerance').addEventListener('change', () => { if (selected && $('#resultContent').hidden === false) calculateAndRender(); });
$('#priceForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selected) { $('#projectSearch').focus(); renderSearch(); return; }
  if (!event.currentTarget.reportValidity()) return;
  calculateAndRender(true);
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

function nearbyNames(project, type) {
  return (project.nearby?.[type] || []).slice(0, 3).map((item) => `${item.name}（${item.distanceMeters}m）`);
}

function automaticAnswers(project, leads) {
  if (!hasCoordinates(project)) return Object.fromEntries(CRITERIA.map((criterion) => [criterion.rank, 'unknown']));
  const has = (type) => nearbyNames(project, type).length > 0;
  const hasOfficialFuture = (rank) => officialFutureFacilities(project, leads, rank).length > 0;
  const currentPoiType = { 2: 'transit', 4: 'grocery', 7: 'park', 11: 'mall', 12: 'hospital' };
  return Object.fromEntries(CRITERIA.map((criterion) => {
    if (hasOfficialFuture(criterion.rank)) return [criterion.rank, 'yes'];
    if (currentPoiType[criterion.rank]) return [criterion.rank, has(currentPoiType[criterion.rank]) ? 'yes' : 'no'];
    return [criterion.rank, 'unknown'];
  }));
}

function automaticDetail(project, rank, leads) {
  const planned = officialFutureFacilities(project, leads, rank);
  if (!hasCoordinates(project)) return '基地尚未定位，系統預填為待查。';
  if (planned.length) return `官方公共建設資料：${planned.map((site) => `${site.code ? `${site.code} ` : ''}${site.name}（約 ${Math.round(site.distanceMeters)}m，規劃／施工中）`).join('、')}；${planned[0].coordinateNote || '以官方公開資料為準，仍須查核最新公告。'}`;
  const type = { 2: 'transit', 4: 'grocery', 7: 'park', 11: 'mall', 12: 'hospital' }[rank];
  if (!type) return '尚無可定位的官方規劃／施工中建設資料，系統預填為待查。';
  const names = nearbyNames(project, type);
  if (!names.length) return 'OpenStreetMap 0–300 公尺快照未找到對應設施，系統暫選不符合；可自行查核後調整。';
  return `系統在 0–300 公尺快照找到：${names.join('、')}。`;
}

function saveScoreAnswers() {
  try { localStorage.setItem(scoreStorageKey, JSON.stringify(scoreAnswers)); }
  catch { $('#appreciationNote').textContent = '瀏覽器無法儲存評估；重新整理後可能需要再次填寫。'; }
}

function renderSafetyConfirmation(project, manual, leads) {
  const safety = $('#appreciationSafety');
  safety.replaceChildren();
  const copy = element('div', 'appreciation-safety-copy');
  copy.append(element('strong', '', '警示：尚未自行確認是否有嫌惡設施與地質安全風險。'), element('p', '', '此項不會自動判定、不列入增值分數，也不影響燈號。請另以官方圖資、基地周邊與現場查核；若要自行記錄，可在下方選擇。'));
  const controls = element('div', 'appreciation-choices safety-choices');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '嫌惡設施與地質安全自行確認，不納入分數');
  for (const [value, label] of [['yes', '已確認無重大風險'], ['no', '發現重大風險'], ['unknown', '待查']]) {
    const button = element('button', manual[1] === value ? 'selected' : '', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(manual[1] === value));
    button.addEventListener('click', () => {
      scoreAnswers[project.name] = { ...manual, 1: value };
      saveScoreAnswers();
      renderAppreciation(project, leads);
    });
    controls.append(button);
  }
  safety.append(copy, controls);
}

function renderAppreciation(project, leads) {
  const automatic = automaticAnswers(project, leads);
  const manual = scoreAnswers[project.name] || {};
  const answers = { ...automatic, ...manual };
  renderSafetyConfirmation(project, manual, leads);
  const list = $('#appreciationCriteria');
  list.replaceChildren();
  for (const criterion of CRITERIA) {
    if (criterion.rank === 1) continue;
    const item = element('div', 'appreciation-item');
    const main = element('div', 'appreciation-item-main');
    main.append(element('span', 'appreciation-rank', String(criterion.rank)), element('strong', '', criterion.title), element('em', 'appreciation-tier', criterion.tier));
    main.append(element('small', '', `${criterion.weight} 分`));
    const detail = element('p', '', `${criterion.reason}｜${automaticDetail(project, criterion.rank, leads)}｜購屋者想法：「${criterion.psychology}」`);
    const controls = element('div', 'appreciation-choices');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', `${criterion.title}評估`);
    for (const [value, label] of [['yes', '符合'], ['no', '不符合'], ['unknown', '待查']]) {
      const button = element('button', answers[criterion.rank] === value ? 'selected' : '', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(answers[criterion.rank] === value));
      button.addEventListener('click', () => {
        scoreAnswers[project.name] = { ...manual, [criterion.rank]: value };
        saveScoreAnswers();
        renderAppreciation(project, leads);
      });
      controls.append(button);
    }
    item.append(main, detail, controls);
    list.append(item);
  }
  const score = scoreAppreciation(answers);
  const display = $('#appreciationScore');
  display.replaceChildren();
  display.classList.remove('blocked');
  display.append(element('span', '', '目前加權分數'));
  display.append(element('strong', '', `${score.score} / 100`));
  display.append(element('small', '', `已查核權重 ${score.assessed}% · 可能範圍 ${score.range[0]}–${score.range[1]} 分`));
  const caution = score.assessed < 70 ? '已查核權重尚低，分數只反映目前已知條件；請搭配可能範圍判讀，不代表完整評估。' : '此分數只反映你標記的條件，未檢驗價格是否已反映利多，也不代表未來房價漲幅。';
  $('#appreciationNote').textContent = `${caution}警示：嫌惡設施與地質安全尚未由系統確認，且刻意排除在本分數之外；請自行查核。系統預填依 ${geoSnapshot.generatedAt || '未提供'} 的 OpenStreetMap 0–300 公尺快照及官方公共建設站位資料；點選任一選項可覆寫。規劃／施工中的站點不等於已通車，仍須以官方出入口圖與現場確認。`;
}

$('#runTrend').addEventListener('click', () => {
  const project = projects.find((item) => item.name === $('#trendProject').value);
  if (!project) { $('#trendStatus').textContent = '請先選擇建案。'; return; }
  const result = analyzeTrend(project, transactions, trendEvidence);
  $('#trendResult').hidden = false;
  $('#trendStatus').textContent = `資料快照：${snapshot.generatedAt}；建設線索請點開官方來源查核最新狀態。`;
  const ai = aiSummaries[project.name];
  $('#trendSummary').replaceChildren();
  $('#trendSummary').append(element('span', 'step-index', ai ? 'LLM 整理摘要' : '資料摘要'));
  $('#trendSummary').append(element('h3', '', project.name));
  $('#trendSummary').append(element('p', '', ai?.summary || (result.change === null ? '近三年足量的年度成交樣本不足，尚無法比較年度價格變化。' : `足量樣本的最早與最近年度成交單價中位數相差 ${result.change >= 0 ? '+' : ''}${number(result.change, 1)}%。這是歷史成交變化，不代表未來漲跌。`)));
  const prices = $('#trendPrices');
  prices.replaceChildren();
  if (!result.years.length) prices.append(element('p', '', '近三年沒有可用成交。'));
  for (const item of result.years) prices.append(element('p', 'trend-fact', `${item.year} 年：中位數 ${number(item.median, 1)} 萬／坪 · ${item.count} 筆${item.count < 5 ? '（樣本偏少）' : ''}`));
  const infrastructure = $('#trendInfrastructure');
  infrastructure.replaceChildren();
  if (!result.leads.length) infrastructure.append(element('p', '', '目前沒有可依路名對應的官方建設線索；不代表附近沒有建設。'));
  for (const lead of result.leads) {
    const item = element('div', 'trend-lead');
    item.append(element('strong', '', lead.title), element('small', '', `${lead.status} · ${lead.note}`));
    const link = element('a', '', `查核${lead.source}資料 ↗`);
    link.href = lead.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link);
    infrastructure.append(item);
  }
  $('#trendCaution').textContent = ai?.caution || '同路名只代表可能值得查核，不代表基地靠近車站。完工與通車時程可能變動，利多也可能早已反映在開價中；利率、供給、人口與個案條件同樣影響價格。請以官方公告和現場步行確認，不以此推估報酬率。';
  renderAppreciation(project, result.leads);
});

try {
  const response = await fetch('./data/zhonghe-presale.json');
  if (!response.ok) throw new Error('資料檔無法讀取');
  snapshot = await response.json();
  transactions = snapshot.transactions;
  try {
    const geoResponse = await fetch('./data/zhonghe-geo.json');
    if (geoResponse.ok) geoSnapshot = await geoResponse.json();
  } catch { geoSnapshot = {}; }
  projects = addLocation(getProjects(transactions), geoSnapshot);
  $('#watchProject').replaceChildren(element('option', '', '請選擇建案'));
  $('#watchProject').firstElementChild.value = '';
  for (const project of [...projects].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))) {
    const option = element('option', '', project.name);
    option.value = project.name;
    $('#watchProject').append(option);
  }
  $('#trendProject').replaceChildren(...[...$('#watchProject').options].map((option) => option.cloneNode(true)));
  try {
    const saved = JSON.parse(localStorage.getItem(scoreStorageKey) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [name, answers] of Object.entries(saved)) {
        if (!projects.some((project) => project.name === name) || !answers || typeof answers !== 'object') continue;
        scoreAnswers[name] = Object.fromEntries(Object.entries(answers).filter(([rank, value]) => CRITERIA.some((item) => String(item.rank) === rank) && ['yes', 'no', 'unknown'].includes(value)));
      }
    }
  } catch { scoreAnswers = {}; }
  try {
    const response = await fetch('./data/trend-evidence.json', { cache: 'no-store' });
    if (response.ok) trendEvidence = (await response.json()).items || [];
  } catch { /* Trends still work without infrastructure leads. */ }
  try {
    const response = await fetch('./data/trend-ai.json');
    if (response.ok) aiSummaries = (await response.json()).projects || {};
  } catch { /* AI summaries are optional and generated offline. */ }
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
