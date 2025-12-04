/**
 * HTML to Markdown Converter
 * Uses Turndown.js for conversion
 * Enhanced with cover image extraction and AI-powered descriptions
 */

// Configuration loading helper
let CONFIG = null;

/**
 * Load configuration from config.js
 * @returns {Promise<Object|null>} Configuration object or null if not available
 */
async function loadConfig() {
    if (CONFIG !== null) return CONFIG;
    
    try {
        // Try to load config dynamically (works in module context)
        const configModule = await import('../config.js');
        CONFIG = configModule.default || {};
        return CONFIG;
    } catch (e) {
        console.warn('MarkItDown: config.js not found or invalid. AI descriptions disabled.');
        CONFIG = {};
        return CONFIG;
    }
}

/**
 * Extract cover image URL from page metadata
 * @param {Document} doc - Document object to search
 * @returns {string|null} Cover image URL or null
 */
function getCoverImageUrl(doc) {
    // Try Open Graph image first (most common)
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage && ogImage.content) return ogImage.content;
    
    // Try Twitter card image
    const twitterImage = doc.querySelector('meta[name="twitter:image"]');
    if (twitterImage && twitterImage.content) return twitterImage.content;
    
    // Try Twitter image:src variant
    const twitterImageSrc = doc.querySelector('meta[name="twitter:image:src"]');
    if (twitterImageSrc && twitterImageSrc.content) return twitterImageSrc.content;
    
    // Try schema.org image
    const schemaImage = doc.querySelector('meta[itemprop="image"]');
    if (schemaImage && schemaImage.content) return schemaImage.content;
    
    return null;
}

/**
 * Get page title from metadata
 * @param {Document} doc - Document object to search
 * @returns {string} Page title
 */
function getPageTitle(doc) {
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) return ogTitle.content;
    
    const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
    if (twitterTitle && twitterTitle.content) return twitterTitle.content;
    
    return doc.title || 'Untitled Page';
}

/**
 * Call OpenAI API to generate image description
 * @param {string} imageUrl - URL of the image to describe
 * @returns {Promise<string|null>} Description or null if failed
 */
async function getLLMDescription(imageUrl) {
    const config = await loadConfig();
    
    if (!config || !config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'sk-YOUR-OPENAI-KEY-HERE') {
        console.warn('MarkItDown: OpenAI API key not configured. Skipping image description.');
        return null;
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: config.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Describe this cover image in 2-3 sentences. Focus on the main subject, visual elements, and overall mood. Be concise and informative.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl,
                                    detail: 'low'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 200
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('MarkItDown: OpenAI API error:', response.status, errorData);
            return null;
        }
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (error) {
        console.error('MarkItDown: Failed to get image description:', error);
        return null;
    }
}

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
    },

    /**
     * Convert HTML with cover image extraction and AI description
     * This is the enhanced async version that includes metadata extraction
     * @param {string} html - Raw HTML content
     * @param {Object} options - Conversion options
     * @param {boolean} options.includeCoverImage - Whether to include cover image (default: true)
     * @param {boolean} options.includeAIDescription - Whether to generate AI description (default: true)
     * @returns {Promise<string>} Markdown content with cover image and description
     */
    async convertWithMetadata(html, options = {}) {
        const { includeCoverImage = true, includeAIDescription = true } = options;
        
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        // Start with the base content conversion
        let markdown = '';
        
        // Extract cover image if enabled
        if (includeCoverImage) {
            const coverUrl = getCoverImageUrl(doc);
            if (coverUrl) {
                // Add page title as heading
                const pageTitle = getPageTitle(doc);
                markdown += `# ${pageTitle}\n\n`;
                
                // Add cover image
                markdown += `![Cover Image](${coverUrl})\n\n`;
                
                // Get AI description if enabled
                if (includeAIDescription) {
                    const description = await getLLMDescription(coverUrl);
                    if (description) {
                        markdown += `> **Image Description:** ${description}\n\n`;
                    }
                }
                
                markdown += '---\n\n';
            }
        }
        
        // Add the converted content
        markdown += this.convertClean(html);
        
        return markdown;
    }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.HtmlConverter = HtmlConverter;
    // Also export helper functions for external use
    window.getCoverImageUrl = getCoverImageUrl;
    window.getLLMDescription = getLLMDescription;
    window.getPageTitle = getPageTitle;
}
