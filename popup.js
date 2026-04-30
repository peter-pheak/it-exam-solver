document.addEventListener('DOMContentLoaded', () => {
  const deepseekInput = document.getElementById('deepseekKey');
  const ocrInput = document.getElementById('ocrKey');
  const geminiInput = document.getElementById('geminiKey');
  const openrouterInput = document.getElementById('openrouterKey');
  const openrouterModelInput = document.getElementById('openrouterModel');
  const mistralInput = document.getElementById('mistralKey');
  const mistralModelInput = document.getElementById('mistralModel');
  const defaultCategoryInput = document.getElementById('defaultCategory');
  const saveBtn = document.getElementById('saveBtn');
  const captureBtn = document.getElementById('captureBtn');
  const status = document.getElementById('status');
  const resultArea = document.getElementById('resultArea');
  const resultText = document.getElementById('resultText');
  const sessionTokensEl = document.getElementById('sessionTokens');
  const resetSessionBtn = document.getElementById('resetSessionBtn');

  function updateSessionDisplay(session) {
    const total = (session?.input || 0) + (session?.output || 0);
    const cost = session?.cost || 0;
    sessionTokensEl.textContent = `Session: ${total} tokens | Est: $${cost.toFixed(2)}`;
  }

  function loadSessionStats() {
    chrome.storage.local.get('sessionStats', (res) => {
      updateSessionDisplay(res.sessionStats);
    });
  }

  loadSessionStats();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sessionStats) {
      updateSessionDisplay(changes.sessionStats.newValue);
    }
  });

  resetSessionBtn.addEventListener('click', () => {
    chrome.storage.local.set({ sessionStats: { input: 0, output: 0, cost: 0 } }, () => {
      updateSessionDisplay({ input: 0, output: 0, cost: 0 });
      status.textContent = 'Session reset!';
      setTimeout(() => status.textContent = '', 2000);
    });
  });

  // Load saved keys
  chrome.storage.local.get(['deepseekKey', 'ocrKey', 'geminiKey', 'openrouterKey', 'openrouterModel', 'mistralKey', 'mistralModel', 'defaultCategory'], (res) => {
    if (res.deepseekKey) deepseekInput.value = res.deepseekKey;
    if (res.ocrKey) ocrInput.value = res.ocrKey;
    if (res.geminiKey) geminiInput.value = res.geminiKey;
    if (res.openrouterKey) openrouterInput.value = res.openrouterKey;
    if (res.openrouterModel) openrouterModelInput.value = res.openrouterModel;
    if (res.mistralKey) mistralInput.value = res.mistralKey;
    if (res.mistralModel) mistralModelInput.value = res.mistralModel;
    if (res.defaultCategory) defaultCategoryInput.value = res.defaultCategory;
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      deepseekKey: deepseekInput.value,
      ocrKey: ocrInput.value,
      geminiKey: geminiInput.value,
      openrouterKey: openrouterInput.value,
      openrouterModel: openrouterModelInput.value || 'google/gemini-2.5-flash',
      mistralKey: mistralInput.value,
      mistralModel: mistralModelInput.value,
      defaultCategory: defaultCategoryInput.value
    }, () => {
      status.textContent = 'Saved!';
      setTimeout(() => status.textContent = '', 2000);
    });
  });

  captureBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Send message to start selection
    chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
    window.close(); // Close popup so user can select
  });

  // Listen for results from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showResult') {
      resultArea.style.display = 'block';
      resultText.innerHTML = request.text.replace(/\n/g, '<br>');
    }
  });
});