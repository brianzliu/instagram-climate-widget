import { blankJournal, demoJournal } from './domain.js';
import { editJournal } from './journal-mutations.js';
export const extensionAPI = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome?.runtime?.id ? globalThis.chrome : null;
// Preserve the original keys so the Touch Grass rename keeps existing journals.
export const JOURNAL_KEYS = { personal: 'evergreen:personal:v1', demo: 'evergreen:demo:v1' };
export async function getValue(key, fallback) {
  if (extensionAPI) { const result = await extensionAPI.storage.local.get(key); return result[key] ?? fallback; }
  const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback;
}
export async function setValue(key, value) {
  if (extensionAPI) await extensionAPI.storage.local.set({ [key]: value });
  else localStorage.setItem(key, JSON.stringify(value));
}
export async function loadJournal(mode) {
  return (await getValue(JOURNAL_KEYS[mode], null)) ?? (mode === 'demo' ? demoJournal() : blankJournal());
}
export async function changeJournal(mode, edit) {
  if (extensionAPI) {
    const response = await extensionAPI.runtime.sendMessage({ type: 'EDIT_JOURNAL', mode, edit });
    if (response?.error) throw new Error(response.error);
    return response.journal;
  }
  const key = JOURNAL_KEYS[mode];
  const update = () => {
    const stored = localStorage.getItem(key);
    const journal = editJournal(stored ? JSON.parse(stored) : mode === 'demo' ? demoJournal() : blankJournal(), edit);
    localStorage.setItem(key, JSON.stringify(journal));
    return journal;
  };
  return navigator.locks ? navigator.locks.request(key, update) : update();
}
export function downloadFile(name, body, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
