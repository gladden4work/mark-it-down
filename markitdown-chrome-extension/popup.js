/**
 * Popup Script
 * Handles user interactions and orchestrates conversions
 */

document.addEventListener('DOMContentLoaded', () => {
    const convertPageBtn = document.getElementById('convertPage');
    const convertSelectionBtn = document.getElementById('convertSelection');
    const copyBtn = document.getElementById('copyBtn');
    const output = document.getElementById('output');
    const status = document.getElementById('status');

    /**
     * Show status message
     */
    function showStatus(message, type = 'loading') {
        status.textContent = message;
        status.className = 'status ' + type;
    }

    /**
     * Clear status
     */
    function clearStatus() {
        status.textContent = '';
        status.className = 'status';
    }

    /**
     * Get current tab
     */
    async function getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }

    /**
     * Convert current page to Markdown
     */
    async function convertPage() {
        try {
            showStatus('Converting page...', 'loading');
            convertPageBtn.disabled = true;

            const tab = await getCurrentTab();

            // Check if it's a YouTube page
            if (YouTubeConverter.isYouTubeVideo(tab.url)) {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'getYouTubeData' });
                if (response && response.success) {
                    output.value = YouTubeConverter.convert(response.data);
                    showStatus('YouTube video converted!', 'success');
                } else {
                    throw new Error(response?.error || 'Failed to get YouTube data');
                }
            } else {
                // Regular page - get HTML content
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        return {
                            html: document.documentElement.outerHTML,
                            title: document.title,
                            url: window.location.href
                        };
                    }
                });

                if (result && result.result) {
                    const { html, url } = result.result;
                    
                    // Show progress for AI description
                    showStatus('Extracting cover image...', 'loading');
                    
                    // Use the enhanced converter with metadata extraction
                    let markdown = '';
                    markdown += `> Source: ${url}\n\n`;
                    
                    // Try to use the async converter with metadata
                    if (typeof HtmlConverter.convertWithMetadata === 'function') {
                        showStatus('Generating AI description...', 'loading');
                        markdown += await HtmlConverter.convertWithMetadata(html, {
                            includeCoverImage: true,
                            includeAIDescription: true
                        });
                    } else {
                        // Fallback to basic conversion
                        const title = result.result.title;
                        if (title) markdown = `# ${title}\n\n` + markdown;
                        markdown += '---\n\n';
                        markdown += HtmlConverter.convertClean(html);
                    }

                    output.value = markdown;
                    showStatus('Page converted!', 'success');
                } else {
                    throw new Error('Could not access page content');
                }
            }
        } catch (error) {
            console.error('Conversion error:', error);
            showStatus('Error: ' + error.message, 'error');
        } finally {
            convertPageBtn.disabled = false;
        }
    }

    /**
     * Convert selected text to Markdown
     */
    async function convertSelection() {
        try {
            showStatus('Converting selection...', 'loading');
            convertSelectionBtn.disabled = true;

            const tab = await getCurrentTab();

            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const selection = window.getSelection();
                    if (!selection || selection.rangeCount === 0) return null;

                    const range = selection.getRangeAt(0);
                    const container = document.createElement('div');
                    container.appendChild(range.cloneContents());

                    return {
                        html: container.innerHTML,
                        text: selection.toString()
                    };
                }
            });

            if (result && result.result && result.result.html) {
                const markdown = HtmlConverter.convert(result.result.html);
                output.value = markdown;
                showStatus('Selection converted!', 'success');
            } else {
                showStatus('No text selected', 'error');
            }
        } catch (error) {
            console.error('Selection error:', error);
            showStatus('Error: ' + error.message, 'error');
        } finally {
            convertSelectionBtn.disabled = false;
        }
    }

    /**
     * Copy output to clipboard
     */
    async function copyToClipboard() {
        if (!output.value) {
            showStatus('Nothing to copy', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(output.value);
            copyBtn.textContent = '✓';
            copyBtn.classList.add('copied');
            showStatus('Copied to clipboard!', 'success');

            setTimeout(() => {
                copyBtn.textContent = '📋';
                copyBtn.classList.remove('copied');
                clearStatus();
            }, 2000);
        } catch (error) {
            showStatus('Failed to copy', 'error');
        }
    }

    // Event listeners
    convertPageBtn.addEventListener('click', convertPage);
    convertSelectionBtn.addEventListener('click', convertSelection);
    copyBtn.addEventListener('click', copyToClipboard);

    // Keyboard shortcut: Ctrl/Cmd + C when focused on output
    output.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && output.value) {
            // Let default copy work, but show status
            setTimeout(() => showStatus('Copied!', 'success'), 100);
        }
    });
});
