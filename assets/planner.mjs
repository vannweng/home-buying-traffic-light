import { newIdeaId, parseNotebook, notebookMarkdown } from './planner-data.mjs';

const form = document.querySelector('.notebook');
const project = form.dataset.project;
const title = form.dataset.projectTitle;
const key = `life-lab-project-notes-v2:${project}`;
const legacyKey = `life-lab-project-notes-v1:${project}`;
const direction = form.elements.direction;
const list = document.querySelector('#ideaList');
const empty = document.querySelector('#ideaEmpty');
const count = document.querySelector('#ideaCount');
const addButton = document.querySelector('#addIdea');
const newIdea = document.querySelector('#newIdea');
const undoNotice = document.querySelector('#ideaUndo');
const undoButton = document.querySelector('#undoDelete');
const saveButton = form.querySelector('[type="submit"]');
const downloadButton = document.querySelector('#downloadNotes');
const status = document.querySelector('#saveStatus');
let ideas = [];
let timer;
let dirty = false;
let locked = false;
let storageReadable = true;
let raw = null;
let lastRemoved = null;
let migrated = false;

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
  return { version: 2, direction: direction.value, ideas, draft: newIdea.value, updatedAt: new Date().toISOString() };
}

function save() {
  clearTimeout(timer);
  if (locked) return false;
  if (!storageReadable) {
    showStatus('無法讀取原有儲存空間，請下載備份保留這次內容。', 'error');
    return false;
  }
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

function queueSave() {
  if (locked) return;
  dirty = true;
  showStatus('正在儲存…');
  clearTimeout(timer);
  timer = setTimeout(save, 300);
}

function fitTextArea(input) {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight + 2}px`;
}

function toolButton(symbol, action, label, handler, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'idea-tool';
  button.dataset.action = action;
  button.textContent = symbol;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = disabled;
  button.addEventListener('click', handler);
  return button;
}

function renderIdeas(focusId) {
  const rows = ideas.map((idea) => {
    const row = document.createElement('li');
    row.className = 'idea-row';
    row.dataset.id = idea.id;
    row.classList.toggle('is-complete', idea.done);
    const checkLabel = document.createElement('label');
    checkLabel.className = 'idea-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'idea-checkbox';
    checkbox.checked = idea.done;
    checkbox.disabled = locked;
    checkLabel.append(checkbox);
    const input = document.createElement('textarea');
    input.className = 'idea-text';
    input.rows = 1;
    input.value = idea.text;
    input.placeholder = '寫下一個點子…';
    input.readOnly = locked;
    const removeButton = toolButton('×', 'delete', '刪除點子', () => {
      if (locked) return;
      const at = ideas.indexOf(idea);
      lastRemoved = { idea, index: at };
      ideas.splice(at, 1);
      undoNotice.hidden = false;
      renderIdeas(ideas[Math.min(at, ideas.length - 1)]?.id);
      if (!ideas.length) newIdea.focus();
      queueSave();
    }, locked);
    const updateLabels = () => {
      const summary = idea.text.trim().replace(/\s+/g, ' ').slice(0, 36) || '未命名點子';
      checkbox.setAttribute('aria-label', `${idea.done ? '取消完成' : '標記完成'}：${summary}`);
      input.setAttribute('aria-label', `編輯點子：${summary}`);
      removeButton.setAttribute('aria-label', `刪除點子：${summary}`);
    };
    checkbox.addEventListener('change', () => {
      idea.done = checkbox.checked;
      row.classList.toggle('is-complete', idea.done);
      updateLabels();
      queueSave();
    });
    input.addEventListener('input', () => { idea.text = input.value; fitTextArea(input); updateLabels(); });
    updateLabels();
    row.append(checkLabel, input, removeButton);
    return row;
  });
  list.replaceChildren(...rows);
  empty.hidden = ideas.length > 0;
  count.textContent = `${ideas.length} 個點子`;
  list.querySelectorAll('textarea').forEach(fitTextArea);
  if (focusId) rows.find((row) => row.dataset.id === focusId)?.querySelector('textarea').focus();
}

try {
  raw = localStorage.getItem(key);
  if (raw === null) raw = localStorage.getItem(legacyKey);
  if (raw !== null) {
    const parsed = parseNotebook(raw);
    direction.value = parsed.notes.direction;
    newIdea.value = parsed.notes.draft;
    ideas = parsed.notes.ideas;
    migrated = parsed.migrated;
    showSaved(parsed.notes.updatedAt);
  } else {
    showStatus('還沒有筆記，寫下第一個想法吧。');
  }
} catch {
  if (raw !== null) {
    locked = true;
    downloadButton.textContent = '下載原始備份';
    empty.textContent = '原有筆記暫時無法顯示，請先下載原始備份。';
    showStatus('原有筆記無法讀取，已保留資料，請先下載原始備份。', 'error');
  } else {
    storageReadable = false;
    showStatus('此瀏覽器無法讀取儲存空間，請用下載備份保留筆記。', 'error');
  }
}

direction.disabled = false;
direction.readOnly = locked;
saveButton.disabled = locked;
newIdea.disabled = locked;
addButton.disabled = locked || !newIdea.value.trim();
downloadButton.disabled = false;
renderIdeas();
if (migrated) {
  document.querySelector('#migrationNote').hidden = false;
  dirty = true;
  save();
}

function addIdea() {
  if (locked) return;
  const text = newIdea.value.trim();
  if (!text) { newIdea.focus(); return; }
  ideas.push({ id: newIdeaId(), text, done: false });
  newIdea.value = '';
  addButton.disabled = true;
  renderIdeas();
  newIdea.focus();
  queueSave();
}
addButton.addEventListener('click', addIdea);
newIdea.addEventListener('input', () => { addButton.disabled = locked || !newIdea.value.trim(); });
newIdea.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  addIdea();
});
undoButton.addEventListener('click', () => {
  if (locked || !lastRemoved) return;
  const { idea, index } = lastRemoved;
  ideas.splice(Math.min(index, ideas.length), 0, idea);
  lastRemoved = null;
  undoNotice.hidden = true;
  renderIdeas(idea.id);
  queueSave();
});
form.addEventListener('input', queueSave);
form.addEventListener('submit', (event) => { event.preventDefault(); save(); });

downloadButton.addEventListener('click', () => {
  if (dirty) save();
  const content = locked ? raw : notebookMarkdown(title, currentNotes());
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
  if (dirty && !save()) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('resize', () => list.querySelectorAll('textarea').forEach(fitTextArea));
