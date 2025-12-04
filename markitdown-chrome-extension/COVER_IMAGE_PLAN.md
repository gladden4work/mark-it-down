# Plan: Add Cover Image & AI Description to Chrome Extension

## Goal
Enhance the MarkItDown Chrome Extension to automatically extract the page's cover image (from Open Graph/Twitter meta tags) and generate a detailed description using OpenAI's multimodal models, embedding both into the final Markdown output.

## Preferences & Constraints
- **Architecture**: Browser-side only (no Python backend required).
- **Security**: Use a local `config.js` file for API keys.
- **Version Control**: Ensure API keys are **never** committed to the repository.
- **Model**: Use `gpt-5-mini-2025-08-07` (default) for speed/cost.

## Context
- **Current State**: The extension uses `turndown.js` to convert visible HTML to Markdown. It misses "invisible" metadata like social media cover images.
- **Requirement**: 
  1. Extract image URL from `<meta property="og:image">`.
  2. Send image URL to OpenAI API.
  3. Insert `![Alt](url)` and `# Description: ...` at the top of the Markdown.

## Implementation Instructions

### 1. Secure Configuration
Create a config file to hold the API key. This file must be ignored by Git.

**File:** `markitdown-chrome-extension/config.js`
```javascript
const CONFIG = {
    OPENAI_API_KEY: "sk-YOUR-OPENAI-KEY-HERE",
    OPENAI_MODEL: "gpt-5-mini-2025-08-07"
};
export default CONFIG;
```

### 2. Update Git Ignore
Prevent the config file from being tracked.

**File:** `.gitignore` (Add to existing)
```text
markitdown-chrome-extension/config.js
```

### 3. Update Manifest
Allow the extension to contact OpenAI and use ES modules for imports.

**File:** `markitdown-chrome-extension/manifest.json`
- Add `host_permissions` for OpenAI.
- Ensure background script (if used for this logic) or content scripts can handle the request. *Note: For content scripts, we might need to use dynamic import or move logic to background if CORS is an issue, but `host_permissions` usually solves this for extensions.*

```json
{
  "permissions": [
    "activeTab", 
    "scripting", 
    "storage"
  ],
  "host_permissions": [
    "https://api.openai.com/*"
  ]
}
```

### 4. Update Converter Logic
Modify the HTML converter to fetch the description.

**File:** `markitdown-chrome-extension/converters/html-converter.js`

**Steps:**
1.  **Import Config**: `import CONFIG from '../config.js';` (Note: This requires the script to be loaded as a module).
2.  **Extract Image**:
    ```javascript
    function getCoverImageUrl(document) {
        return document.querySelector('meta[property="og:image"]')?.content ||
               document.querySelector('meta[name="twitter:image"]')?.content || null;
    }
    ```
3.  **Call OpenAI**:
    ```javascript
    async function getLLMDescription(imageUrl) {
        if (!CONFIG.OPENAI_API_KEY) return null;
        // Fetch implementation...
    }
    ```
4.  **Prepend to Markdown**:
    ```javascript
    // Inside convertHtmlToMarkdown...
    const coverUrl = getCoverImageUrl(document);
    if (coverUrl) {
        markdown += `![Cover Image](${coverUrl})\n\n`;
        const desc = await getLLMDescription(coverUrl);
        if (desc) markdown += `# Description\n${desc}\n\n`;
    }
    ```
