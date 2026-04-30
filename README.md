# IT Exam Solver

A Chrome extension for capturing and solving IT exam questions using AI-powered text extraction and multiple LLM providers.

## Features

- **Region Capture** - Select any area on the screen to capture exam questions
- **Dual Text Extraction** - Extract text from DOM or use OCR as fallback
- **Multiple AI Providers** - DeepSeek V4, Mistral, Google Gemini, OpenRouter
- **Category Modes** - CCNA/Web Search, CCNA/Pure AI, Vision AI, Code, Math, General
- **Token Tracking** - Monitor input/output tokens and estimated costs
- **Result Management** - Copy answers to clipboard, switch providers dynamically

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/peter-pheak/it-exam-solver.git
   cd it-exam-solver
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the extension directory

## Configuration

Open the extension popup and configure:

| Setting | Description |
|---------|-------------|
| Default Mode | Choose processing category (Web Search, Pure AI, Vision, Code, Math, General) |
| DeepSeek API Key | Required for DeepSeek V4 models |
| Mistral API Key | Optional - alternative provider |
| Gemini API Key | Optional - Google AI Studio key |
| OpenRouter API Key | Optional - for additional models |

## Usage

1. Click the extension icon or press `Alt+Q`
2. Click and drag to select the question area
3. The extension extracts text and processes through AI
4. View results in the modal popup
5. Use dropdowns to change category or provider
6. Click "Copy" to copy answer to clipboard

## Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| DeepSeek | V4 Flash, V4 Pro | Primary provider |
| Mistral | Large, Medium, Small | Alternative |
| Gemini | 2.5 Flash | Free tier available |
| OpenRouter | Various | Custom models |

## Keyboard Shortcuts

- `Alt+Q` - Start region capture

## Architecture

```
popup.html/js/css  - Settings UI and capture trigger
background.js      - Processing pipeline and API calls
content.js         - Region selection and result display
manifest.json      - Extension configuration
```

## Requirements

- Chrome browser (Manifest V3)
- At least one API key configured
- Internet connection for API calls

## License

MIT License

## Author

Peter Pheak