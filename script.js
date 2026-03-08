const containers = {
  path: document.getElementById('path-params'),
  query: document.getElementById('query-params'),
  header: document.getElementById('headers'),
};

const methodEl = document.getElementById('method');
const urlEl = document.getElementById('url');
const sendBtn = document.getElementById('send');
const bodyEl = document.getElementById('body');
const jsonToggle = document.getElementById('json-toggle');
const statusEl = document.getElementById('status');
const durationEl = document.getElementById('duration');
const sizeEl = document.getElementById('size');
const responseHeadersEl = document.getElementById('response-headers');
const responseBodyEl = document.getElementById('response-body');
const responseVisualEl = document.getElementById('response-visual');
const formatBtn = document.getElementById('format-response');
const copyBtn = document.getElementById('copy-response');
const tabBtns = document.querySelectorAll('.tab-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const installBtn = document.getElementById('install-btn');
let deferredInstallPrompt = null;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function addRow(container, defaults = { key: '', value: '' }) {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const keyInput = document.createElement('input');
  keyInput.placeholder = 'Key';
  keyInput.value = defaults.key;

  const valueInput = document.createElement('input');
  valueInput.placeholder = 'Value';
  valueInput.value = defaults.value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ghost';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => row.remove());

  row.append(keyInput, valueInput, removeBtn);
  container.appendChild(row);
}

function readRows(container) {
  const entries = Array.from(container.querySelectorAll('.kv-row')).map(row => {
    const [keyInput, valueInput] = row.querySelectorAll('input');
    return { key: keyInput.value.trim(), value: valueInput.value };
  }).filter(({ key }) => key);
  return entries;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function applyPathParams(rawUrl, params) {
  let output = rawUrl;
  params.forEach(({ key, value }) => {
    if (!key) return;
    const encoded = encodeURIComponent(value);
    const braceRegex = new RegExp(`{${escapeRegex(key)}}`, 'g');
    const colonRegex = new RegExp(`:${escapeRegex(key)}(?![\\w-])`, 'g');
    output = output.replace(braceRegex, encoded).replace(colonRegex, encoded);
  });
  return output;
}

function buildUrl(baseUrl, queryPairs) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch (err) {
    throw new Error('Enter a valid absolute URL (https://...)');
  }
  queryPairs.forEach(({ key, value }) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function rowsToObject(pairs) {
  return pairs.reduce((acc, { key, value }) => {
    if (!key) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function renderHeaders(headers) {
  const entries = [];
  headers.forEach((value, key) => entries.push(`${key}: ${value}`));
  return entries.length ? entries.join('\n') : '(none)';
}

async function sendRequest() {
  const method = methodEl.value;
  const rawUrl = urlEl.value.trim();
  if (!rawUrl) return;

  const pathParams = readRows(containers.path);
  const queryParams = readRows(containers.query);
  const headerPairs = readRows(containers.header);

  const urlWithPath = applyPathParams(rawUrl, pathParams);
  let finalUrl;
  try {
    finalUrl = buildUrl(urlWithPath, queryParams);
  } catch (err) {
    alert(err.message);
    return;
  }

  const headers = rowsToObject(headerPairs);
  const options = { method, headers };

  if (method !== 'GET') {
    const bodyText = bodyEl.value.trim();
    if (jsonToggle.checked) {
      if (bodyText) {
        try {
          options.body = JSON.stringify(JSON.parse(bodyText));
        } catch (err) {
          alert('Body is not valid JSON.');
          return;
        }
      } else {
        options.body = '{}';
      }
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    } else {
      options.body = bodyText;
    }
  }

  statusEl.textContent = '…';
  statusEl.className = 'status-badge';
  durationEl.textContent = '…';
  sizeEl.textContent = '…';
  responseHeadersEl.textContent = 'Waiting for response...';
  responseBodyEl.textContent = '';
  setLoading(true);
  
  const started = performance.now();
  try {
    const res = await fetch(finalUrl, options);
    const elapsed = Math.round(performance.now() - started);
    
    // Retrieve body as blob to determine exact size
    const blob = await res.blob();
    const size = blob.size;
    
    statusEl.textContent = `${res.status} ${res.statusText}`;
    statusEl.className = res.status < 400 ? 'status-badge success' : 'status-badge error';
    durationEl.textContent = `${elapsed} ms`;
    sizeEl.textContent = formatBytes(size);
    responseHeadersEl.textContent = renderHeaders(res.headers);

    const text = await blob.text();
    responseBodyEl.textContent = text || '(empty body)';
    
    let parsedData = null;
    if (jsonToggle.checked) {
      try {
        parsedData = JSON.parse(text);
        responseBodyEl.textContent = JSON.stringify(parsedData, null, 2);
      } catch (err) {
        // Not valid JSON, keep as text
      }
    } else {
      try {
        parsedData = JSON.parse(text);
      } catch (e) {}
    }
    
    renderVisualView(parsedData);
  } catch (err) {
    statusEl.textContent = 'Request failed';
    statusEl.className = 'status-badge error';
    durationEl.textContent = '—';
    sizeEl.textContent = '—';
    responseHeadersEl.textContent = '(none)';
    responseBodyEl.textContent = err.message;
    renderVisualView(null);
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle('hidden', !isLoading);
}

function renderVisualView(data) {
  responseVisualEl.innerHTML = '';
  if (data === null || data === undefined) {
    responseVisualEl.innerHTML = '<span class="json-val-null">No valid JSON data to display preview.</span>';
    return;
  }
  
  responseVisualEl.appendChild(createVisualElement(data));
}

function createVisualElement(data) {
  if (Array.isArray(data)) {
    const list = document.createElement('div');
    list.className = 'json-card-list';
    if (data.length === 0) {
      list.textContent = '[] (Empty array)';
      list.className = 'json-val-null';
      return list;
    }
    data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'json-card';
      card.appendChild(createVisualElement(item));
      list.appendChild(card);
    });
    return list;
  } else if (data !== null && typeof data === 'object') {
    const objDict = document.createElement('div');
    objDict.className = 'json-object';
    
    const keys = Object.keys(data);
    if (keys.length === 0) {
      objDict.textContent = '{} (Empty object)';
      objDict.className = 'json-val-null';
      return objDict;
    }
    
    keys.forEach(key => {
      const row = document.createElement('div');
      row.className = 'json-row';
      
      const keyEl = document.createElement('div');
      keyEl.className = 'json-key';
      keyEl.textContent = key;
      
      const valEl = document.createElement('div');
      valEl.className = 'json-value';
      valEl.appendChild(createVisualElement(data[key]));
      
      row.appendChild(keyEl);
      row.appendChild(valEl);
      objDict.appendChild(row);
    });
    return objDict;
  } else {
    // Primitive
    const span = document.createElement('span');
    if (typeof data === 'string') {
      span.className = 'json-val-string';
      span.textContent = `"${data}"`;
    } else if (typeof data === 'number') {
      span.className = 'json-val-number';
      span.textContent = data;
    } else if (typeof data === 'boolean') {
      span.className = 'json-val-boolean';
      span.textContent = data;
    } else if (data === null) {
      span.className = 'json-val-null';
      span.textContent = 'null';
    } else {
      span.textContent = data;
    }
    return span;
  }
}

function wireButtons() {
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.add;
      addRow(containers[target]);
    });
  });
  if (sendBtn) sendBtn.addEventListener('click', sendRequest);
  
  if (formatBtn) formatBtn.addEventListener('click', formatResponse);
  
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const content = responseBodyEl.textContent;
      if (!content || content === '(waiting)') return;
      try {
        await navigator.clipboard.writeText(content);
        // Show temporary success state
        const originalContent = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        setTimeout(() => { copyBtn.innerHTML = originalContent; }, 2000);
      } catch (err) {
        alert('Failed to copy. ' + err);
      }
    });
  }
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons and panes
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      // Add active class to clicked button
      btn.classList.add('active');
      
      // Add active class to target pane
      const targetId = btn.dataset.tab === 'raw' ? 'response-body' : 'response-visual';
      document.getElementById(targetId).classList.add('active');
    });
  });

  if (urlEl) {
    urlEl.addEventListener('input', updateSendButtonState);
    updateSendButtonState();
  }
}

function seedRows() {
  addRow(containers.path, { key: 'id', value: '123' });
  addRow(containers.query);
  addRow(containers.header, { key: 'Accept', value: 'application/json' });
}

function formatResponse() {
  const raw = responseBodyEl.textContent.trim();
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    responseBodyEl.textContent = JSON.stringify(parsed, null, 2);
  } catch (err) {
    alert('Response body is not valid JSON to format.');
  }
}

function updateSendButtonState() {
  const hasUrl = urlEl && urlEl.value.trim().length > 0;
  if (sendBtn) {
    sendBtn.disabled = !hasUrl;
  }
}

function toggleInstallButton(show) {
  if (!installBtn) return;
  installBtn.classList.toggle('hidden', !show);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(err => {
      console.error('Service worker registration failed', err);
    });
  });
}

function setupPWAInstall() {
  toggleInstallButton(false);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    toggleInstallButton(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    toggleInstallButton(false);
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      installBtn.disabled = true;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      toggleInstallButton(false);
      installBtn.disabled = false;
    });
  }
}

wireButtons();
seedRows();
setupPWAInstall();
registerServiceWorker();
