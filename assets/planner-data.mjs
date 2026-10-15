export function newIdeaId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function parseNotebook(raw, createId = newIdeaId) {
  const notes = JSON.parse(raw);
  if (!notes || typeof notes.direction !== 'string' || typeof notes.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(notes.updatedAt))) throw new Error('Invalid saved notes');

  if (notes.version === 1 && typeof notes.ideas === 'string') {
    return {
      notes: {
        version: 2, direction: notes.direction, draft: '', updatedAt: notes.updatedAt,
        ideas: notes.ideas.split(/\r?\n/).filter((line) => line.trim()).map((text) => ({ id: createId(), text, done: false })),
      },
      migrated: true,
    };
  }

  if (notes.version !== 2 || !Array.isArray(notes.ideas)
    || notes.ideas.some((idea) => !idea || typeof idea.id !== 'string' || !idea.id || typeof idea.text !== 'string')
    || notes.ideas.some((idea) => idea.done !== undefined && typeof idea.done !== 'boolean')
    || (notes.draft !== undefined && typeof notes.draft !== 'string')
    || new Set(notes.ideas.map((idea) => idea.id)).size !== notes.ideas.length) throw new Error('Invalid saved ideas');

  return {
    notes: {
      version: 2, direction: notes.direction, draft: notes.draft ?? '', updatedAt: notes.updatedAt,
      ideas: notes.ideas.map(({ id, text, done = false }) => ({ id, text, done })),
    },
    migrated: false,
  };
}

export function notebookMarkdown(title, notes) {
  const list = notes.ideas.filter((idea) => idea.text.trim()).map((idea) => {
    const text = idea.text.replace(/\r\n/g, '\n').split('\n').join('\n  ');
    return `- [${idea.done ? 'x' : ' '}] ${text}`;
  }).join('\n\n');
  const draft = notes.draft?.trim() ? `\n## 尚未加入的點子\n\n${notes.draft}\n` : '';
  return `# ${title}｜專案點子本\n\n## 方向與目標\n\n${notes.direction}\n\n## 點子與靈感\n\n${list}\n${draft}`;
}
