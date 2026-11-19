import { blankJournal, dateKey } from './domain.js';
import { comparisonDetails } from './climate-facts.js';
import { isCompressedPhoto, photoLimit } from './action-photos.js';

export function editJournal(journal, edit) {
  if (edit.type === 'clear') return blankJournal();
  if (edit.type === 'removeProfile') {
    return {
      ...journal,
      observations: journal.observations.filter(profile => profile.username !== edit.username),
      observedPosts: (journal.observedPosts || []).filter(post => post.username !== edit.username),
    };
  }
  const steps = journal.nextSteps || [];
  if (edit.type === 'addStep') {
    if (steps.length >= 100) throw new Error('Remove an old plan to add another.');
    return { ...journal, nextSteps: [...steps, edit.step] };
  }
  if (edit.type === 'removeStep') return { ...journal, nextSteps: steps.filter(step => step.id !== edit.id) };
  if (edit.type === 'completeStep') {
    const step = steps.find(item => item.id === edit.id);
    if (!step || step.actionId) throw new Error('This plan has already been completed or removed.');
    return { ...journal, actions: [...journal.actions, edit.action],
      nextSteps: steps.map(item => item === step ? { ...item, actionId: edit.action.id } : item) };
  }
  if (edit.type === 'removeAction') {
    return { ...journal, actions: journal.actions.filter(action => action.id !== edit.id),
      nextSteps: steps.map(step => step.actionId === edit.id ? { id: step.id, title: step.title } : step) };
  }
  if (edit.type === 'editComparison') {
    if (!journal.actions.some(action => action.id === edit.id)) throw new Error('This action is no longer in your journal.');
    return { ...journal, actions: journal.actions.map(action => {
      if (action.id !== edit.id) return action;
      const { comparisonTopic, tripMiles, ...entry } = action;
      return { ...entry, ...comparisonDetails(entry, edit.topic, edit.miles, { strict: true }) };
    }) };
  }
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
      return [{ id: action.id, ...(typeof action.kind === 'string' ? { kind: action.kind.slice(0, 40) } : {}), title: action.title.trim().slice(0, 600), date: action.date,
        note: typeof action.note === 'string' ? action.note.slice(0, 600) : '',
        source: ['instagram', 'next-step'].includes(action.source) ? action.source : 'manual',
        ...(sourcePostId ? { sourcePostId } : {}),
        ...comparisonDetails(action, action.comparisonTopic, action.tripMiles),
        ...(Array.isArray(action.photos) ? { photos: action.photos.slice(0, photoLimit).filter(isCompressedPhoto) } : {}) }];
    });
    return { ...journal, actions: [...journal.actions, ...actions] };
  }
  throw new Error('Unsupported journal change.');
}
