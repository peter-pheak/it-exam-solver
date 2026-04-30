document.addEventListener('DOMContentLoaded', () => {
  const deepseekInput = document.getElementById('deepseekKey');
  const ocrInput = document.getElementById('ocrKey');
  const geminiInput = document.getElementById('geminiKey');
  const openrouterInput = document.getElementById('openrouterKey');
  const openrouterModelInput = document.getElementById('openrouterModel');
  const defaultCategoryInput = document.getElementById('defaultCategory');
  const saveBtn = document.getElementById('saveBtn');
  const captureBtn = document.getElementById('captureBtn');
  const status = document.getElementById('status');
  const resultArea = document.getElementById('resultArea');
  const resultText = document.getElementById('resultText');

  // Load saved keys
  chrome.storage.local.get(['deepseekKey', 'ocrKey', 'geminiKey', 'openrouterKey', 'openrouterModel', 'defaultCategory'], (res) => {
    if (res.deepseekKey) deepseekInput.value = res.deepseekKey;
    if (res.ocrKey) ocrInput.value = res.ocrKey;
    if (res.geminiKey) geminiInput.value = res.geminiKey;
    if (res.openrouterKey) openrouterInput.value = res.openrouterKey;
    if (res.openrouterModel) openrouterModelInput.value = res.openrouterModel;
    if (res.defaultCategory) defaultCategoryInput.value = res.defaultCategory;
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      deepseekKey: deepseekInput.value,
      ocrKey: ocrInput.value,
      geminiKey: geminiInput.value,
      openrouterKey: openrouterInput.value,
      openrouterModel: openrouterModelInput.value || 'google/gemini-2.5-flash',
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