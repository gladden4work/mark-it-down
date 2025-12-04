/**
 * HTML to Markdown Converter
 * Uses Turndown.js for conversion
 */

const HtmlConverter = {
    /**
     * Convert HTML string to Markdown
     * @param {string} html - HTML content to convert
     * @returns {string} Markdown content
     */
    convert(html) {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            hr: '---',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            emDelimiter: '*',
            strongDelimiter: '**'
        });

        // Add custom rules for better conversion
        turndownService.addRule('strikethrough', {
            filter: ['del', 's', 'strike'],
            replacement: function (content) {
                return '~~' + content + '~~';
            }
        });

        return turndownService.turndown(html);
    },

    /**
     * Convert a DOM element to Markdown
     * @param {Element} element - DOM element to convert
     * @returns {string} Markdown content
     */
    convertElement(element) {
        return this.convert(element.outerHTML);
    },

    /**
     * Clean and convert HTML, removing scripts, styles, etc.
     * @param {string} html - Raw HTML content
     * @returns {string} Cleaned Markdown content
     */
    convertClean(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // Remove only truly unwanted elements (be less aggressive)
        const removeSelectors = [
            'script', 'style', 'noscript', 'iframe',
            '.advertisement', '.ads', '#ads', '.cookie-banner',
            '[aria-hidden="true"]'
        ];

        removeSelectors.forEach(selector => {
            try {
                doc.querySelectorAll(selector).forEach(el => el.remove());
            } catch (e) {
                // Ignore invalid selectors
            }
        });

        // Extended list of content selectors (ordered by specificity)
        const contentSelectors = [
            // Article content
            'article', '[role="article"]', '.article', '.article-content', '.article-body',
            // Main content
            'main', '[role="main"]', '#main', '.main', '.main-content',
            // Post content (blogs)
            '.post', '.post-content', '.post-body', '.entry-content', '.entry',
            // Generic content containers
            '.content', '#content', '.page-content', '.body-content',
            // CMS specific
            '.markdown-body', '.prose', '.rich-text', '.text-content',
            // Vue/React app containers
            '#app', '#root', '.app', '[data-v-app]',
            // Fallback to body
            'body'
        ];

        // Try each selector until we find content
        for (const selector of contentSelectors) {
            try {
                const element = doc.querySelector(selector);
                if (element) {
                    const content = this.convert(element.innerHTML);
                    // Only return if we got meaningful content (more than just whitespace)
                    if (content && content.trim().length > 50) {
                        return content;
                    }
                }
            } catch (e) {
                // Ignore invalid selectors
            }
        }

        // Final fallback: convert the entire body
        return this.convert(doc.body ? doc.body.innerHTML : html);
    }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.HtmlConverter = HtmlConverter;
}
