const urlInput = document.getElementById('apiBaseUrl');
const tokenInput = document.getElementById('apiToken');
const statusEl = document.getElementById('status');

chrome.storage.sync.get(['apiBaseUrl', 'apiToken'], (data) => {
  if (data.apiBaseUrl) urlInput.value = data.apiBaseUrl;
  if (data.apiToken) tokenInput.value = data.apiToken;
});

function setStatus(message, ok) {
  statusEl.textContent = message;
  statusEl.className = ok ? 'ok' : 'err';
}

function normalizeBaseUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return null;
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const apiBaseUrl = normalizeBaseUrl(urlInput.value.trim());
  const apiToken = tokenInput.value.trim();

  if (!apiBaseUrl) {
    setStatus('Enter a valid URL, e.g. https://your-app.vercel.app', false);
    return;
  }
  if (!apiToken) {
    setStatus('Paste your personal API token from the app\'s Settings page.', false);
    return;
  }

  // Request permission to talk to the user's own app domain, since it's
  // configurable and unknown at install time.
  const granted = await chrome.permissions.request({ origins: [`${apiBaseUrl}/*`] });
  if (!granted) {
    setStatus('Permission is required to connect to your app.', false);
    return;
  }

  chrome.storage.sync.set({ apiBaseUrl, apiToken }, () => {
    setStatus('Saved.', true);
  });
});

document.getElementById('test').addEventListener('click', async () => {
  const apiBaseUrl = normalizeBaseUrl(urlInput.value.trim());
  const apiToken = tokenInput.value.trim();
  if (!apiBaseUrl || !apiToken) {
    setStatus('Enter and save your URL and token first.', false);
    return;
  }

  setStatus('Testing…', true);
  try {
    const res = await fetch(`${apiBaseUrl}/api/extension/ping`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setStatus('Connected successfully.', true);
    } else {
      setStatus(data.error ?? 'Connection failed — check your URL and token.', false);
    }
  } catch (e) {
    setStatus(`Could not reach the app: ${e.message}`, false);
  }
});
