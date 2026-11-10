const api = globalThis.browser || chrome;
document.getElementById('journal').onclick = () => api.tabs.create({ url: api.runtime.getURL('index.html') });
document.getElementById('settings').onclick = () => api.tabs.create({ url: api.runtime.getURL('index.html#settings') });
