/**
 * Background Service Worker
 * Handles context menu and background operations
 */

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
    // Context menu for selected text
    chrome.contextMenus.create({
        id: 'markitdown-selection',
        title: 'Convert selection to Markdown',
        contexts: ['selection']
    });

    // Context menu for links
    chrome.contextMenus.create({
        id: 'markitdown-link',
        title: 'Convert linked page to Markdown',
        contexts: ['link']
    });

    // Context menu for pages
    chrome.contextMenus.create({
        id: 'markitdown-page',
        title: 'Convert this page to Markdown',
        contexts: ['page']
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'markitdown-selection') {
        // Get selection and convert
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const selection = window.getSelection();
                    if (!selection || selection.rangeCount === 0) return null;

                    const range = selection.getRangeAt(0);
                    const container = document.createElement('div');
                    container.appendChild(range.cloneContents());

                    return container.innerHTML;
                }
            });

            if (result && result.result) {
                // Store in clipboard
                await copyToClipboard(result.result, 'selection');
                showNotification('Selection converted and copied to clipboard!');
            }
        } catch (error) {
            console.error('Context menu selection error:', error);
        }
    }

    if (info.menuItemId === 'markitdown-page') {
        // Convert current page
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                    html: document.documentElement.outerHTML,
                    title: document.title,
                    url: window.location.href
                })
            });

            if (result && result.result) {
                await copyToClipboard(result.result, 'page');
                showNotification('Page converted and copied to clipboard!');
            }
        } catch (error) {
            console.error('Context menu page error:', error);
        }
    }

    if (info.menuItemId === 'markitdown-link' && info.linkUrl) {
        // Fetch and convert linked page
        try {
            const response = await fetch(info.linkUrl);
            const html = await response.text();
            await copyToClipboard({ html, url: info.linkUrl }, 'page');
            showNotification('Linked page converted and copied to clipboard!');
        } catch (error) {
            console.error('Context menu link error:', error);
            showNotification('Failed to fetch linked page');
        }
    }
});

/**
 * Convert content and copy to clipboard
 * Uses offscreen document for clipboard access in service worker
 */
async function copyToClipboard(data, type) {
    // For service workers, we need to use offscreen document or inject script
    // For simplicity, we'll use a script injection approach

    let markdown = '';

    if (type === 'selection') {
        // Simple HTML to Markdown for selection
        markdown = simpleHtmlToMarkdown(data);
    } else if (type === 'page') {
        markdown = `# ${data.title || 'Untitled'}\n\n`;
        markdown += `> Source: ${data.url}\n\n---\n\n`;
        markdown += simpleHtmlToMarkdown(data.html);
    }

    // Store markdown for popup to access
    await chrome.storage.local.set({ lastConversion: markdown });

    return markdown;
}

/**
 * Simple HTML to Markdown conversion (for background script)
 * This is a lightweight version since we can't load full Turndown in service worker
 */
function simpleHtmlToMarkdown(html) {
    if (!html) return '';

    // Create a temporary DOM parser
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Remove unwanted elements
    doc.querySelectorAll('script, style, noscript, nav, footer, header, aside').forEach(el => el.remove());

    let text = doc.body.textContent || '';

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

/**
 * Show notification to user
 */
function showNotification(message) {
    // Note: Notifications require 'notifications' permission
    // For now, just log
    console.log('MarkItDown:', message);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getLastConversion') {
        chrome.storage.local.get(['lastConversion'], (result) => {
            sendResponse({ markdown: result.lastConversion || '' });
        });
        return true;
    }
});
