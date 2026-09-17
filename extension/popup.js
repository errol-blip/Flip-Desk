chrome.storage.sync.get(['apiBaseUrl', 'apiToken'], (data) => {
  const statusEl = document.getElementById('status');
  if (data.apiBaseUrl && data.apiToken) {
    statusEl.innerHTML = '<span class="dot ok"></span>Connected';
  } else {
    statusEl.innerHTML = '<span class="dot err"></span>Not connected — open Settings';
  }
});

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
