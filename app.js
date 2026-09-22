const form = document.querySelector('#homeForm');
const storageKey = 'home-buying-traffic-light-v1';
const checks = ['確認實價登錄與同社區成交', '現場查看採光、噪音與漏水', '取得銀行初步貸款條件', '核對權狀、車位與公設比', '詢問管理費、修繕與社區基金', '用雨天與尖峰時段再走一次'];
const $ = (s) => document.querySelector(s);

function money(n, digits = 1) { return Number.isFinite(n) ? n.toLocaleString('zh-TW', { maximumFractionDigits: digits }) : '--'; }
function payment(principalWan, annualRate, years) {
  const P = principalWan * 10000, r = annualRate / 100 / 12, n = years * 12;
  if (!P || !n) return 0;
  return r === 0 ? P / n : P * r * (1 + r) ** n / ((1 + r) ** n - 1);
}
function inputs() { return Object.fromEntries(new FormData(form).entries()); }
function updateOutputs() { document.querySelectorAll('.ratings input').forEach(input => input.previousElementSibling.value = input.value); }
function renderChecks(done = []) {
  $('#checklist').innerHTML = checks.map((label, i) => `<label class="check-item"><input type="checkbox" data-index="${i}" ${done.includes(i) ? 'checked' : ''}><span>${label}</span></label>`).join('');
  syncCheckCount();
}
function syncCheckCount() { const done = [...document.querySelectorAll('.check-item input:checked')].length; $('#checkCount').textContent = `${done} / ${checks.length}`; }
function save() { const values = inputs(); values.checks = [...document.querySelectorAll('.check-item input:checked')].map(x => +x.dataset.index); localStorage.setItem(storageKey, JSON.stringify(values)); $('#savedState').textContent = '已自動儲存'; setTimeout(() => $('#savedState').textContent = '資料儲存在這台裝置', 1800); }
function setSignal(score, title, text, color) {
  $('#scoreValue').textContent = score; $('#scoreBar').style.width = `${score}%`; $('#scoreBar').style.background = `var(--${color})`;
  $('#bigLight').className = `big-light ${color}`; $('#signalTitle').textContent = title; $('#signalDescription').textContent = text;
  document.querySelectorAll('.light').forEach(x => x.classList.remove('active')); document.querySelector(`.light.${color}`).classList.add('active');
  $('#heroSignal').textContent = title; $('#heroScore').textContent = `目前 ${score} / 100`;
}
function calculate() {
  if (!form.reportValidity()) return;
  const v = inputs(), price = +v.totalPrice, area = +v.area, down = +v.downPayment, income = +v.monthlyIncome;
  const monthly = payment(Math.max(price - down, 0), +v.loanRate || 0, +v.loanYears || 35) / 10000;
  const ratio = income ? monthly / income * 100 : 100, downRatio = price ? down / price * 100 : 0;
  const subjective = ((+v.location + +v.condition + +v.resale) / 15) * 35;
  const finance = Math.max(0, 42 - Math.max(0, ratio - 30) * 1.35 - Math.max(0, 20 - downRatio) * 1.1);
  const score = Math.round(Math.min(100, subjective + finance + 23));
  $('#unitPrice').textContent = money(price / area); $('#monthlyPayment').textContent = money(monthly); $('#incomeRatio').textContent = `${money(ratio, 0)}%`; $('#downRatio').textContent = `${money(downRatio, 0)}%`;
  let color = 'green', title = '條件健康，可談價', text = '財務壓力與你的主觀評價都在可接受範圍，帶著實價與屋況資料進入議價。';
  if (score < 55 || ratio > 50 || downRatio < 15) { color = 'red'; title = '先停一下，再看清楚'; text = ratio > 50 ? '月付金占收入偏高，先重新盤點貸款額度與生活預備金。' : '自備款或整體條件有明顯缺口，別急著用喜歡掩蓋風險。'; }
  else if (score < 72 || ratio > 40 || downRatio < 20) { color = 'yellow'; title = '值得進一步確認'; text = ratio > 40 ? '負擔接近警戒線，請先取得銀行試算並保留裝修、稅費與緊急預備金。' : '基本條件可研究，但成交行情與屋況仍是出價前的關鍵。'; }
  setSignal(score, title, text, color); $('#signalDate').textContent = new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric' }).format(new Date()); save();
}
function restore() { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (!saved) { renderChecks(); return; } Object.entries(saved).forEach(([key, value]) => { const el = form.elements[key]; if (el && typeof value === 'string') el.value = value; }); renderChecks(saved.checks || []); updateOutputs(); calculate(); }
form.addEventListener('input', updateOutputs); form.addEventListener('submit', e => { e.preventDefault(); calculate(); });
document.addEventListener('change', e => { if (e.target.matches('.check-item input')) { syncCheckCount(); save(); } });
$('#resetButton').addEventListener('click', () => { if (confirm('要清除目前這個物件的所有資料嗎？')) { localStorage.removeItem(storageKey); form.reset(); renderChecks(); updateOutputs(); $('#scoreValue').textContent = '--'; $('#scoreBar').style.width = '0'; $('#unitPrice').textContent = $('#monthlyPayment').textContent = $('#incomeRatio').textContent = $('#downRatio').textContent = '--'; setSignal(0, '先輸入一個物件', '資料填妥後，這裡會整理出你下一步該確認的事。', 'yellow'); } });
restore();
