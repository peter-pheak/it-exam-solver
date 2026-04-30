chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureRegion') {
    handleCapture(request.rect, request.domText, sender.tab.id);
  } else if (request.action === 'reRunQuery') {
    reRunQuery(request.category, sender.tab.id);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'start-capture') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch (e) {}
      chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
    }
  }
});

async function handleCapture(rect, domText, tabId) {
  try {
    // 1. Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    // 2. Crop image using OffscreenCanvas
    const croppedDataUrl = await cropImage(dataUrl, rect);

    let extractedText = domText;

    if (extractedText && extractedText.trim().length > 5) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => showToast("Text extracted instantly from page!")
      });
    } else {
      // 3. OCR to extract text
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => showToast("Extracting text from image...")
      });
      
      extractedText = await runOCR(croppedDataUrl);
    }

    if (!extractedText || !extractedText.trim()) {
      // If OCR fails, fallback immediately to Vision model
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => showToast("OCR failed to read text. Using Vision fallback...")
      });
      const answer = await fallbackVisionModel(croppedDataUrl);
      chrome.runtime.sendMessage({ action: 'showResult', text: answer });
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (ans) => showResultModal(ans),
        args: [answer]
      });
      return;
    }

    await chrome.storage.local.set({ 
      lastCapturedText: extractedText, 
      lastCapturedImage: croppedDataUrl 
    });

    const keys = await chrome.storage.local.get(['defaultCategory']);
    const category = keys.defaultCategory || 'ccna-web';

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (cat) => showToast("Processing with mode: " + cat + "..."),
      args: [category]
    });

    const answer = await processQuestion(extractedText, category, croppedDataUrl);

    // 7. Send result back to popup or inject into page
    chrome.runtime.sendMessage({ action: 'showResult', text: answer });
    
    // Also alert in tab
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (ans) => showResultModal(ans),
      args: [answer]
    });

  } catch (error) {
    console.error(error);
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (err) => alert("Error: " + err),
      args: [error.message]
    });
  }
}

async function processQuestion(text, category, imageUrl) {
  if (category === 'vision') {
    return await fallbackVisionModel(imageUrl, text);
  }
  if (category === 'ccna-web') {
    const cleanSearchQuery = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const shortSearchQuery = cleanSearchQuery.split(' ').slice(0, 20).join(' ');
    
    const searchResults = await searchITExamAnswers(shortSearchQuery);
    if (searchResults && searchResults.length > 0) {
      const articleContent = await fetchArticle(searchResults[0].url);
      const answer = await extractAnswerWithDeepSeek(text, articleContent);
      if (answer && !answer.includes("Error")) return answer;
    }
    // Fallback if web search fails
    return await callTextAI("You are an expert Cisco/IT network engineer. Read the question and provide the exact correct multiple-choice answer, followed by a brief explanation.", text, false);
  } else if (category === 'ccna-ai') {
    return await callTextAI("You are an expert Cisco/IT network engineer. Read the question and provide the exact correct multiple-choice answer, followed by a brief explanation.", text, false);
  } else if (category === 'code') {
    return await callTextAI("You are a Senior Software Engineer. Analyze the code or question, explain the logic briefly, and provide the correct answer or code snippet.", text, false);
  } else if (category === 'math') {
    return await callTextAI("You are a Math Professor. Solve this step-by-step, then output the final answer clearly at the bottom.", text, true); // Keep reasoning for math
  } else {
    return await callTextAI("You are a helpful expert assistant. Reason through this question and provide the most accurate answer.", text, false);
  }
}

async function callTextAI(systemPrompt, userText, isReasoning = false) {
  const keys = await chrome.storage.local.get(['deepseekKey', 'geminiKey', 'openrouterKey', 'openrouterModel']);
  
  if (keys.deepseekKey) {
    try {
      const modelName = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';
      const payload = {
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        max_tokens: isReasoning ? 1000 : 500 // Increased slightly for chat to ensure full answers
      };
      if (!isReasoning) payload.temperature = 0.1;

      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.deepseekKey}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.choices && data.choices[0]) return "🤖 DeepSeek:\n" + data.choices[0].message.content;
    } catch (e) { console.warn("DeepSeek text failed", e); }
  }

  if (keys.geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys.geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.1 }
        })
      });
      const data = await res.json();
      if (data.candidates && data.candidates[0]) return "🤖 Gemini:\n" + data.candidates[0].content.parts[0].text;
    } catch (e) { console.warn("Gemini text failed", e); }
  }

  if (keys.openrouterKey) {
    try {
      const model = keys.openrouterModel || 'google/gemini-2.5-flash';
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.openrouterKey}` },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ],
          temperature: 0.1
        })
      });
      const data = await res.json();
      if (data.choices && data.choices[0]) return "🤖 OpenRouter:\n" + data.choices[0].message.content;
    } catch (e) { console.warn("OpenRouter text failed", e); }
  }

  return "Error: AI text generation failed. Please check your API keys.";
}

async function reRunQuery(category, tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => { 
      const el = document.getElementById('it-exam-result-text');
      if (el) el.innerHTML = '<i>Re-evaluating with AI...</i>'; 
    }
  });
  
  const stored = await chrome.storage.local.get(['lastCapturedText', 'lastCapturedImage']);
  const textToProcess = stored.lastCapturedText;
  const imageToProcess = stored.lastCapturedImage;

  let answer = "";
  if (!textToProcess || !textToProcess.trim()) {
     if (imageToProcess) {
       answer = await fallbackVisionModel(imageToProcess);
     } else {
       answer = "Error: No text was extracted initially. Pure AI modes require text. Please try capturing again.";
     }
  } else {
     answer = await processQuestion(textToProcess, category, imageToProcess);
  }

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (ans) => { 
      const el = document.getElementById('it-exam-result-text');
      if(el) el.innerHTML = window.parseMarkdown(ans); 
    },
    args: [answer]
  });
}

async function cropImage(dataUrl, rect) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  
  // Calculate exact scale factor to avoid devicePixelRatio bugs on different OS/browsers
  const scale = bitmap.width / rect.windowWidth;
  
  const canvasWidth = Math.max(1, Math.round(rect.width * scale));
  const canvasHeight = Math.max(1, Math.round(rect.height * scale));
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  
  ctx.drawImage(
    bitmap,
    rect.x * scale,
    rect.y * scale,
    rect.width * scale,
    rect.height * scale,
    0,
    0,
    canvas.width,
    canvas.height
  );
  
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(croppedBlob);
  });
}

async function runOCR(imageDataUrl) {
  const keys = await chrome.storage.local.get(['ocrKey']);
  const apiKey = keys.ocrKey && keys.ocrKey.trim() !== '' ? keys.ocrKey.trim() : 'helloworld';

  const base64Data = imageDataUrl.split(',')[1];
  
  const formData = new FormData();
  formData.append('base64Image', 'data:image/png;base64,' + base64Data);
  formData.append('language', 'eng');
  formData.append('apikey', apiKey);
  formData.append('scale', 'true'); // Upscale for better reading
  formData.append('OCREngine', '2'); // Engine 2 is much better for screenshots
  
  let retries = 2;
  while (retries >= 0) {
    try {
      const res = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData
      });
      
      if (res.status === 429) throw new Error("Rate limited by HTTP 429");
      
      const data = await res.json();
      if (data.IsErroredOnProcessing) {
        const errMsg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(', ') : data.ErrorMessage;
        // Check if it's a rate limit error from the API payload
        if (errMsg.toLowerCase().includes('limit') || errMsg.toLowerCase().includes('time')) {
          throw new Error("API Rate Limit: " + errMsg);
        }
        console.warn("OCR API Error:", errMsg);
        return ""; // Other error, trigger fallback immediately
      }
      
      return data.ParsedResults?.[0]?.ParsedText || "";
    } catch (e) {
      console.warn(`OCR attempt failed (${e.message}). Retries left: ${retries}`);
      if (retries === 0) return ""; // Trigger fallback after all retries fail
      
      // Wait 3 seconds before retrying to respect rate limits
      await new Promise(r => setTimeout(r, 3000));
      retries--;
    }
  }
  return "";
}

async function searchITExamAnswers(query) {
  // Use a CORS proxy to bypass restrictions
  const searchUrl = `https://itexamanswers.net/?s=${encodeURIComponent(query)}`;
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(searchUrl)}`;
  
  const res = await fetch(proxyUrl);
  const html = await res.text();
  
  // Robust regex for WordPress search results (usually <h2 class="entry-title"><a href="...">)
  const match = html.match(/<h[23][^>]*class="[^"]*(?:title|entry-title)[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"/i) || 
                html.match(/<h[23][^>]*>\s*<a[^>]+href="([^"]+)"/i);
                
  if (match && match[1]) {
    return [{ url: match[1] }];
  }
  return null;
}

async function fetchArticle(url) {
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  const html = await res.text();
  
  // Extract text content roughly (WordPress entry-content)
  const bodyMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<(?:footer|div|article)/i) ||
                    html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<div id="comments"/i);
                    
  let rawContent = "";
  if (bodyMatch) {
    rawContent = bodyMatch[1];
  } else {
    // Fallback to body
    const bodyFallback = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    rawContent = bodyFallback ? bodyFallback[1] : html;
  }
  
  return rawContent; // Return raw HTML so we can parse styles
}

async function extractAnswerWithDeepSeek(question, rawArticleHtml) {
  // 1. Try to find the answer directly using HTML parsing (Zero tokens!)
  // ITExamAnswers usually highlights the correct answer in red.
  const cleanQ = question.replace(/\s+/g, ' ').trim().toLowerCase();
  
  // Find where the question appears in the HTML to narrow down the context
  let contextHtml = rawArticleHtml;
  const qIndex = rawArticleHtml.toLowerCase().indexOf(cleanQ.substring(0, 40));
  
  if (qIndex !== -1) {
    // Grab the question and the next 1500 characters (reduced for token management)
    contextHtml = rawArticleHtml.substring(qIndex, qIndex + 1500);
  } else {
    // Fallback: just take the first 1500 chars of the content
    contextHtml = rawArticleHtml.substring(0, 1500);
  }

  // Check if we found red text inside our context
  const localRedMatches = [...contextHtml.matchAll(/<[^>]*style="[^"]*color:\s*(?:#ff0000|red)[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi)];

  if (localRedMatches.length > 0) {
    // We found red text! Clean it and return it directly. No AI needed!
    let extractedAnswers = localRedMatches
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 0);
      
    if (extractedAnswers.length > 0) {
       return "🎯 Extracted directly (0 tokens used!):\n" + extractedAnswers.join('\n');
    }
  }

  // 2. If HTML parsing fails, fallback to DeepSeek but with a MUCH smaller prompt
  const cleanContext = contextHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const keys = await chrome.storage.local.get(['deepseekKey']);
  if (!keys.deepseekKey) throw new Error("DeepSeek API key not set in popup.");

  const prompt = `Question:\n"${question}"\n\nArticle Snippet:\n"${cleanContext}"\n\nProvide only the correct answer concisely.`;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keys.deepseekKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 150
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return "🤖 DeepSeek Answer:\n" + data.choices[0].message.content;
}

async function fallbackVisionModel(imageDataUrl, text = '') {
  const keys = await chrome.storage.local.get(['geminiKey', 'openrouterKey', 'openrouterModel']);
  if (!keys.geminiKey && !keys.openrouterKey) throw new Error("Gemini or OpenRouter API key not set for fallback. Please set one in the extension popup to use Vision AI.");

  const promptText = text && text.trim().length > 0 
    ? `Extract any additional context from the image, read the question, and provide the correct answer. Here is the extracted text for context: "${text}"` 
    : 'Extract the question from this image and provide the correct answer.';

  if (keys.geminiKey) {
    try {
      const base64Data = imageDataUrl.split(',')[1];
      const mimeType = imageDataUrl.split(';')[0].split(':')[1] || 'image/jpeg';

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys.geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                { inline_data: { mime_type: mimeType, data: base64Data } }
              ]
            }
          ]
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return "👁️ Vision AI (Gemini):\n" + data.candidates[0].content.parts[0].text;
    } catch (e) {
      console.warn("Gemini Vision failed, trying OpenRouter if available", e);
    }
  }

  if (keys.openrouterKey) {
    const model = keys.openrouterModel || 'google/gemini-2.5-flash';
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keys.openrouterKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ]
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return "👁️ Vision AI (OpenRouter):\n" + data.choices[0].message.content;
  }

  throw new Error("Vision AI failed. Please check your API keys and quotas.");
}