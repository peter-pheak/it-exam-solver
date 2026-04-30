// content.js - Overlay for region selection and UI feedback

let overlay, startX, startY, selectionBox, currentRect = null, hintElement = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startSelection') {
    chrome.storage.local.get(['lastRect'], (res) => {
      createOverlay(res.lastRect);
    });
  }
});

function createOverlay(lastRect) {
  if (document.getElementById('it-exam-solver-overlay')) return;

  overlay = document.createElement('div');
  overlay.id = 'it-exam-solver-overlay';
  overlay.tabIndex = 0; // Make it focusable to catch keyboard events
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.3)', zIndex: '999999', cursor: 'crosshair',
    outline: 'none' // Hide focus ring
  });

  selectionBox = document.createElement('div');
  Object.assign(selectionBox.style, {
    position: 'absolute', border: '2px dashed #fff', backgroundColor: 'rgba(255,255,255,0.2)',
    display: 'none', pointerEvents: 'none'
  });

  hintElement = document.createElement('div');
  Object.assign(hintElement.style, {
    position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: '6px',
    fontFamily: 'sans-serif', fontSize: '14px', pointerEvents: 'none', textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  });

  if (lastRect) {
    currentRect = lastRect;
    selectionBox.style.left = lastRect.x + 'px';
    selectionBox.style.top = lastRect.y + 'px';
    selectionBox.style.width = lastRect.width + 'px';
    selectionBox.style.height = lastRect.height + 'px';
    selectionBox.style.display = 'block';
    
    // Add a visual cue to the selection box that it's clickable
    selectionBox.style.pointerEvents = 'auto';
    selectionBox.style.cursor = 'pointer';
    selectionBox.style.backgroundColor = 'rgba(59, 130, 246, 0.3)'; // Slight blue tint
    selectionBox.style.border = '2px solid #3b82f6';
    
    hintElement.innerHTML = "<b>Click inside the box</b> or press <b>ENTER</b> to capture.<br>Drag outside to draw a new area. <b>ESC</b> to cancel.";
  } else {
    hintElement.innerHTML = "Drag to select an area.<br>Press <b>ESC</b> to cancel.";
  }

  overlay.appendChild(selectionBox);
  overlay.appendChild(hintElement);
  document.body.appendChild(overlay);
  
  overlay.focus(); // Focus immediately to trap Enter/Esc

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  overlay.addEventListener('keydown', onKeyDown); // Attach to overlay instead of document
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeOverlay();
  } else if (e.key === 'Enter' && currentRect) {
    e.preventDefault();
    e.stopPropagation();
    captureAndClose(currentRect);
  }
}

function closeOverlay() {
  if (overlay && document.body.contains(overlay)) {
    document.body.removeChild(overlay);
  }
  startX = startY = null;
  currentRect = null;
}

function onMouseDown(e) {
  if (currentRect) {
    // Check if clicked inside the existing rect
    const isInside = e.clientX >= currentRect.x && e.clientX <= currentRect.x + currentRect.width &&
                     e.clientY >= currentRect.y && e.clientY <= currentRect.y + currentRect.height;
    if (isInside) {
      e.preventDefault();
      e.stopPropagation();
      captureAndClose(currentRect);
      return;
    }
  }

  // Start new drag
  startX = e.clientX;
  startY = e.clientY;
  
  // Reset styles for new drawing
  selectionBox.style.pointerEvents = 'none';
  selectionBox.style.backgroundColor = 'rgba(255,255,255,0.2)';
  selectionBox.style.border = '2px dashed #fff';
  
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
  hintElement.innerHTML = "Release to capture.";
}

function onMouseMove(e) {
  if (startX == null || startY == null) return;
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

async function onMouseUp(e) {
  if (startX == null || startY == null) return;
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const rect = {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
    windowWidth: window.innerWidth
  };

  // Increased threshold to prevent accidental tiny drags
  if (rect.width > 20 && rect.height > 20) {
    chrome.storage.local.set({ lastRect: rect });
    captureAndClose(rect);
  } else {
    // Accidental click/drag, reset drawing state
    startX = startY = null;
    if (currentRect) {
       // Restore previous rect visually
       selectionBox.style.left = currentRect.x + 'px';
       selectionBox.style.top = currentRect.y + 'px';
       selectionBox.style.width = currentRect.width + 'px';
       selectionBox.style.height = currentRect.height + 'px';
       selectionBox.style.pointerEvents = 'auto';
       selectionBox.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
       selectionBox.style.border = '2px solid #3b82f6';
       hintElement.innerHTML = "<b>Click inside the box</b> or press <b>ENTER</b> to capture.<br>Drag outside to draw a new area. <b>ESC</b> to cancel.";
    } else {
       selectionBox.style.display = 'none';
       hintElement.innerHTML = "Drag to select an area.<br>Press <b>ESC</b> to cancel.";
    }
  }
}

function captureAndClose(rect) {
  closeOverlay();
  const domText = extractTextFromDOM(rect);
  chrome.runtime.sendMessage({ action: 'captureRegion', rect, domText });
}

function extractTextFromDOM(rect) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  let textParts = [];
  const range = document.createRange();
  
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.trim();
    if (!text) continue;
    
    range.selectNodeContents(node);
    const nodeRect = range.getBoundingClientRect();
    
    if (nodeRect.width === 0 || nodeRect.height === 0) continue;
    
    const isIntersecting = !(
      nodeRect.right < rect.x ||
      nodeRect.left > rect.x + rect.width ||
      nodeRect.bottom < rect.y ||
      nodeRect.top > rect.y + rect.height
    );
    
    if (isIntersecting) {
      textParts.push(text);
    }
  }
  return textParts.join(' ');
}

// UI Feedback functions injected by background.js
window.parseMarkdown = function(text) {
  if (!text) return '';
  let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Escape HTML
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre style="background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:5px;overflow-x:auto;font-family:monospace;font-size:12px;margin:8px 0;"><code>$1</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;color:#e83e8c;padding:2px 4px;border-radius:3px;font-family:monospace;font-size:12px;">$1</code>');
  // Bold
  html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
};

window.showToast = function(message) {
  let toast = document.getElementById('it-exam-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'it-exam-toast';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '20px', right: '20px', background: '#333', color: '#fff',
      padding: '10px 20px', borderRadius: '5px', zIndex: '999999', fontFamily: 'sans-serif',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'opacity 0.3s',
      pointerEvents: 'none' // CRITICAL: Prevents the invisible toast from blocking clicks!
    });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, 3000);
};

window.showResultModal = function(answer) {
  const existing = document.getElementById('it-exam-result-panel');
  if (existing) document.body.removeChild(existing);

  const panel = document.createElement('div');
  panel.id = 'it-exam-result-panel';
  Object.assign(panel.style, {
    position: 'fixed', top: '20px', right: '20px', width: '400px',
    background: '#fff', borderRadius: '8px', zIndex: '999999',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontFamily: 'sans-serif',
    color: '#333', border: '2px solid #2563eb', display: 'flex',
    flexDirection: 'column', overflow: 'hidden'
  });
  
  panel.innerHTML = `
    <div style="background: #2563eb; color: #fff; padding: 10px 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
      <select id="it-exam-category-select" style="background: #1d4ed8; color: white; border: 1px solid #60a5fa; border-radius: 4px; padding: 4px; font-size: 12px; outline: none; flex-grow: 1;">
        <option value="ccna-web">CCNA / IT (Web Search)</option>
        <option value="ccna-ai">CCNA / IT (Pure AI)</option>
        <option value="vision">Image/Exhibit (Vision AI)</option>
        <option value="code">Programming (Pure AI)</option>
        <option value="math">Math (Pure AI)</option>
        <option value="general">General (Pure AI)</option>
      </select>
      <span id="it-exam-close-panel" style="cursor: pointer; font-size: 18px; line-height: 1; padding: 0 5px;">&times;</span>
    </div>
    <div id="it-exam-result-text" style="padding: 15px; font-size: 14px; max-height: 500px; overflow-y: auto; line-height: 1.5;">
      ${window.parseMarkdown(answer)}
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Set current category in dropdown
  chrome.storage.local.get(['defaultCategory'], (res) => {
    if (res.defaultCategory) {
      document.getElementById('it-exam-category-select').value = res.defaultCategory;
    }
  });

  // Listen for category change to re-run query
  document.getElementById('it-exam-category-select').addEventListener('change', (e) => {
    const newCat = e.target.value;
    chrome.storage.local.set({ defaultCategory: newCat });
    chrome.runtime.sendMessage({ action: 'reRunQuery', category: newCat });
  });

  document.getElementById('it-exam-close-panel').addEventListener('click', () => {
    if (document.body.contains(panel)) document.body.removeChild(panel);
  });
};