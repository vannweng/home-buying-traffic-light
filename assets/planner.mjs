const form = document.querySelector('.notebook');
const project = form.dataset.project;
const title = form.dataset.projectTitle;
const key = `life-lab-project-notes-v1:${project}`;
const direction = form.elements.direction;
const ideas = form.elements.ideas;
const saveButton = form.querySelector('[type="submit"]');
const downloadButton = document.querySelector('#downloadNotes');
const status = document.querySelector('#saveStatus');
let timer;
let dirty = false;
let locked = false;
let raw = null;

function showStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

function showSaved(updatedAt) {
  const date = new Date(updatedAt).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  showStatus(`已儲存 · ${date}`, 'saved');
}

function currentNotes() {
  return { version: 1, direction: direction.value, ideas: ideas.value, updatedAt: new Date().toISOString() };
}

function save() {
  clearTimeout(timer);
  if (locked) return false;
  const notes = currentNotes();
  try {
    localStorage.setItem(key, JSON.stringify(notes));
    dirty = false;
    showSaved(notes.updatedAt);
    return true;
  } catch {
    showStatus('尚未儲存：瀏覽器無法儲存，請下載備份。', 'error');
    return false;
  }
}

direction.disabled = false;
ideas.disabled = false;
saveButton.disabled = false;
downloadButton.disabled = false;

try {
  raw = localStorage.getItem(key);
  if (raw !== null) {
    const notes = JSON.parse(raw);
    if (!notes || notes.version !== 1 || typeof notes.direction !== 'string' || typeof notes.ideas !== 'string'
      || typeof notes.updatedAt !== 'string' || !Number.isFinite(Date.parse(notes.updatedAt))) {
      throw new Error('Invalid saved notes');
    }
    direction.value = notes.direction;
    ideas.value = notes.ideas;
    showSaved(notes.updatedAt);
  } else {
    showStatus('還沒有筆記，寫下第一個想法吧。');
  }
} catch {
  if (raw !== null) {
    locked = true;
    direction.readOnly = true;
    ideas.readOnly = true;
    saveButton.disabled = true;
    downloadButton.textContent = '下載原始備份';
    showStatus('原有筆記無法讀取，已保留資料，請先下載原始備份。', 'error');
  } else {
    showStatus('此瀏覽器無法讀取儲存空間，請用下載備份保留筆記。', 'error');
  }
}

form.addEventListener('input', () => {
  if (locked) return;
  dirty = true;
  showStatus('正在儲存…');
  clearTimeout(timer);
  timer = setTimeout(save, 300);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  save();
});

downloadButton.addEventListener('click', () => {
  if (dirty) save();
  const content = locked ? raw : `# ${title}｜專案點子本\n\n## 方向與目標\n\n${direction.value}\n\n## 點子與靈感\n\n${ideas.value}\n`;
  const blob = new Blob([content], { type: locked ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title}-${locked ? '原始備份.json' : '點子筆記.md'}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && dirty) save();
});
window.addEventListener('pagehide', () => { if (dirty) save(); });
window.addEventListener('beforeunload', (event) => {
  if (dirty && !save()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
