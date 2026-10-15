import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotebook, notebookMarkdown } from '../assets/planner-data.mjs';

const updatedAt = '2026-10-15T02:00:00.000Z';

test('migrates legacy lines into ordered ideas without changing their text or direction', () => {
  let id = 0;
  const raw = JSON.stringify({ version: 1, direction: '原本的方向\n第二段', ideas: '第一個點子\r\n\r\n  ・保留縮排與符號\n第三個點子', updatedAt });
  const { notes, migrated } = parseNotebook(raw, () => `idea-${++id}`);
  assert.equal(migrated, true);
  assert.equal(notes.direction, '原本的方向\n第二段');
  assert.deepEqual(notes.ideas.map((idea) => idea.text), ['第一個點子', '  ・保留縮排與符號', '第三個點子']);
  assert.equal(new Set(notes.ideas.map((idea) => idea.id)).size, 3);
  assert.equal(notes.updatedAt, updatedAt);
  assert.ok(notes.ideas.every((idea) => idea.done === false));
  assert.equal(notes.draft, '');
});

test('keeps completion flags, multiline edits and pending input when reopening', () => {
  const notes = { version: 2, direction: '', draft: '尚未按加號的內容', ideas: [{ id: 'second', text: '第一行\n第二行', done: true }, { id: 'draft', text: '', done: false }], updatedAt };
  assert.deepEqual(parseNotebook(JSON.stringify(notes)), { notes, migrated: false });
  assert.deepEqual(parseNotebook(JSON.stringify({ version: 1, direction: '', ideas: '\n  \n', updatedAt })).notes.ideas, []);
});

test('opens existing list notes as unchecked without losing text or position', () => {
  const old = { version: 2, direction: '原有方向', ideas: [{ id: 'keep', text: '先寫下的點子' }, { id: 'next', text: '後寫下的點子' }], updatedAt };
  const { notes } = parseNotebook(JSON.stringify(old));
  assert.equal(notes.direction, old.direction);
  assert.deepEqual(notes.ideas, old.ideas.map((idea) => ({ ...idea, done: false })));
  assert.equal(notes.draft, '');
});

test('rejects corrupt notes, unsupported versions and duplicate IDs instead of replacing user data', () => {
  for (const notes of [null, { version: 2, direction: '', ideas: 'wrong', updatedAt }, { version: 3, direction: '', ideas: [], updatedAt }, { version: 2, direction: '', ideas: [], updatedAt: 'invalid' }, { version: 2, direction: '', ideas: [{ id: 'same', text: 'a' }, { id: 'same', text: 'b' }], updatedAt }, { version: 2, direction: '', ideas: [{ id: 'a', text: 'text', done: 'true' }], updatedAt }, { version: 2, direction: '', ideas: [], draft: 123, updatedAt }]) {
    assert.throws(() => parseNotebook(JSON.stringify(notes)));
  }
  assert.throws(() => parseNotebook('{invalid'));
});

test('exports checkbox states, multiline entries and pending input without numbering', () => {
  const result = notebookMarkdown('翻頁之後', { direction: '留住啟發', draft: '未加入的草稿', ideas: [{ id: 'a', text: '第一點\n補充內容', done: false }, { id: 'draft', text: '  ', done: false }, { id: 'b', text: '<script>只當文字</script>', done: true }] });
  assert.ok(result.includes('## 方向與目標\n\n留住啟發'));
  assert.ok(result.includes('- [ ] 第一點\n  補充內容\n\n- [x] <script>只當文字</script>'));
  assert.ok(result.includes('## 尚未加入的點子\n\n未加入的草稿'));
  assert.ok(!result.includes('1.'));
});
