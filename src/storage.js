import { blankJournal, demoJournal } from './domain.js';
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
  const result = await getValue(JOURNAL_KEYS[mode], null);
  if (result) return result;
  const journal = mode === 'demo' ? demoJournal() : blankJournal();
  await setValue(JOURNAL_KEYS[mode], journal);
  return journal;
}
export async function saveJournal(mode, journal) { await setValue(JOURNAL_KEYS[mode], journal); }
export function downloadFile(name, body, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
