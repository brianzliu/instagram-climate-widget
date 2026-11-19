import { blankJournal, dateKey } from './domain.js';

export function editJournal(journal, edit) {
  if (edit.type === 'clear') return blankJournal();
  if (edit.type === 'removeProfile') {
    return {
      ...journal,
      observations: journal.observations.filter(profile => profile.username !== edit.username),
      observedPosts: (journal.observedPosts || []).filter(post => post.username !== edit.username),
    };
  }
  if (edit.type === 'removeAction') return { ...journal, actions: journal.actions.filter(action => action.id !== edit.id) };
  if (edit.type === 'addAction') {
    const action = edit.action;
    if (action.sourcePostId && journal.actions.some(saved => saved.sourcePostId === action.sourcePostId)) {
      throw new Error('This post already has an action in your journal.');
    }
    return { ...journal, actions: [...journal.actions, action] };
  }
  if (edit.type === 'importActions') {
    if (edit.data?.mode !== 'personal' || !Array.isArray(edit.data.actions) || edit.data.actions.length > 20000) {
      throw new Error('Choose a personal Touch Grass journal export.');
    }
    const ids = new Set(journal.actions.map(action => action.id));
    const posts = new Set(journal.actions.map(action => action.sourcePostId).filter(Boolean));
    const actions = edit.data.actions.flatMap(action => {
      if (!action || typeof action.id !== 'string' || !/^[a-f\d-]{36}$/i.test(action.id)
        || typeof action.title !== 'string' || !action.title.trim()
        || typeof action.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(action.date)
        || dateKey(new Date(`${action.date}T12:00:00`)) !== action.date || action.date > dateKey()) return [];
      const sourcePostId = /^instagram:[\w-]{1,64}$/.test(action.sourcePostId || '') ? action.sourcePostId : null;
      if (ids.has(action.id) || (sourcePostId && posts.has(sourcePostId))) return [];
      ids.add(action.id);
      if (sourcePostId) posts.add(sourcePostId);
      return [{ id: action.id, title: action.title.trim().slice(0, 600), date: action.date,
        note: typeof action.note === 'string' ? action.note.slice(0, 600) : '',
        source: action.source === 'instagram' ? 'instagram' : 'manual', ...(sourcePostId ? { sourcePostId } : {}) }];
    });
    return { ...journal, actions: [...journal.actions, ...actions] };
  }
  throw new Error('Unsupported journal change.');
}
