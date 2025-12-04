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
    if (CONFIG !== null) {
        console.log('MarkItDown: Using cached config');
        return CONFIG;
    }
    
    try {
        console.log('MarkItDown: Loading config.js...');
        // Try to load config dynamically (works in module context)
        const configModule = await import('../config.js');
        CONFIG = configModule.default || {};
        console.log('MarkItDown: Config loaded successfully', {
            hasApiKey: !!CONFIG.OPENAI_API_KEY && CONFIG.OPENAI_API_KEY !== 'sk-YOUR-OPENAI-KEY-HERE',
            model: CONFIG.OPENAI_MODEL || 'not set (will use default)'
        });
        return CONFIG;
    } catch (e) {
        console.warn('MarkItDown: config.js not found or invalid. AI descriptions disabled.', e.message);
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
 * Call OpenAI API to generate image description with timeout
 * @param {string} imageUrl - URL of the image to describe
 * @param {number} timeoutMs - Timeout in milliseconds (default 60000 for reasoning models)
 * @returns {Promise<string|null>} Description or null if failed
 */
async function getLLMDescription(imageUrl, timeoutMs = 60000) {
    const config = await loadConfig();
    
    if (!config || !config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'sk-YOUR-OPENAI-KEY-HERE') {
        console.warn('MarkItDown: OpenAI API key not configured. Skipping image description.');
        return null;
    }
    
    console.log('MarkItDown: Requesting LLM description for:', imageUrl);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const model = config.OPENAI_MODEL || 'gpt-4o-mini';
        
        // Build request body - newer models use max_completion_tokens instead of max_tokens
        const requestBody = {
            model: model,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Describe this image in 2-3 sentences. Focus on the main subject, visual elements, and any text visible. Be concise and informative.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl,
                                detail: 'auto'
                            }
                        }
                    ]
                }
            ]
        };
        
        // Use max_completion_tokens for newer/reasoning models (gpt-4o, gpt-5, o1, o3, etc.)
        // Reasoning models need more tokens as they use internal reasoning tokens (~128-256) before responding
        // Use max_tokens for older models (gpt-3.5, gpt-4-turbo, etc.)
        const isReasoningModel = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3') || model.includes('2024') || model.includes('2025');
        if (isReasoningModel) {
            // Reasoning models need ~200 reasoning tokens + ~100 output tokens
            requestBody.max_completion_tokens = 600;
            console.log('MarkItDown: Using max_completion_tokens (600) for reasoning model:', model);
        } else {
            requestBody.max_tokens = 300;
            console.log('MarkItDown: Using max_tokens (300) for model:', model);
        }
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            signal: controller.signal,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('MarkItDown: OpenAI API error:', response.status, JSON.stringify(errorData, null, 2));
            console.error('MarkItDown: Error details:', errorData?.error?.message || 'Unknown error');
            return null;
        }
        
        const data = await response.json();
        const description = data.choices?.[0]?.message?.content || null;
        console.log('MarkItDown: LLM description received:', description ? description.substring(0, 50) + '...' : 'null');
        return description;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error('MarkItDown: LLM request timed out after', timeoutMs, 'ms');
        } else {
            console.error('MarkItDown: Failed to get image description:', error);
        }
        return null;
    }
}

/**
 * Process all inline images in HTML with LLM descriptions
 * @param {string} html - HTML content with images
 * @param {number} timeoutMs - Total timeout for all images (default 60000 for reasoning models)
 * @returns {Promise<string>} HTML with updated image alt texts
 */
async function processInlineImagesWithLLM(html, timeoutMs = 60000) {
    const config = await loadConfig();
    
    if (!config || !config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'sk-YOUR-OPENAI-KEY-HERE') {
        console.log('MarkItDown: Skipping inline image processing - no API key');
        return html;
    }
    
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const images = doc.querySelectorAll('img[src]');
    
    if (images.length === 0) {
        console.log('MarkItDown: No images found in content');
        return html;
    }
    
    console.log(`MarkItDown: Found ${images.length} images to process`);
    
    // Filter images that need processing (no alt text or generic alt)
    const imagesToProcess = Array.from(images).filter(img => {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        
        // Skip data URLs, tiny images, and images with meaningful alt text
        if (src.startsWith('data:')) return false;
        if (alt && alt.length > 10 && !alt.match(/^(image|img|photo|picture|untitled)/i)) return false;
        
        return true;
    });
    
    if (imagesToProcess.length === 0) {
        console.log('MarkItDown: All images already have alt text');
        return html;
    }
    
    console.log(`MarkItDown: Processing ${imagesToProcess.length} images with LLM`);
    
    // Each image gets its own guaranteed timeout (parallel processing)
    const perImageTimeout = 20000; // 20 seconds per image (reasoning models need time)
    const startTime = Date.now();
    
    console.log(`MarkItDown: Per-image timeout: ${perImageTimeout}ms (parallel processing)`);
    
    // Process all images in parallel - each with its own independent timeout
    const processPromises = imagesToProcess.map(async (img, index) => {
        const src = img.getAttribute('src') || '';
        
        try {
            console.log(`MarkItDown: Starting image ${index + 1}/${imagesToProcess.length}: ${src.substring(0, 60)}...`);
            
            // Each image gets full guaranteed timeout
            const description = await getLLMDescription(src, perImageTimeout);
            
            return { img, description, index };
        } catch (error) {
            console.error(`MarkItDown: Error processing image ${index + 1}:`, error);
            return { img, description: null, index };
        }
    });
    
    // Wait for all images to complete (each has its own timeout built-in)
    const results = await Promise.allSettled(processPromises);
    
    // Add descriptions as captions BELOW each image (not in alt text)
    let successCount = 0;
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.description) {
            const { img, description, index } = result.value;
            
            // Create a caption element to be placed after the image
            // This will be converted to text below the image in Markdown
            const caption = doc.createElement('p');
            caption.className = 'markitdown-image-description';
            caption.innerHTML = `<em>🖼️ Image description: ${description}</em>`;
            
            // Insert caption after the image
            if (img.parentNode) {
                img.parentNode.insertBefore(caption, img.nextSibling);
            }
            
            // Keep alt text short (use existing or generic)
            if (!img.getAttribute('alt') || img.getAttribute('alt').length < 5) {
                img.setAttribute('alt', 'Image');
            }
            
            successCount++;
            console.log(`MarkItDown: Image ${index + 1} described successfully`);
        } else if (result.status === 'fulfilled') {
            console.log(`MarkItDown: Image ${result.value.index + 1} - no description returned`);
        }
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`MarkItDown: Successfully described ${successCount}/${imagesToProcess.length} images in ${totalTime}ms`);
    
    return doc.documentElement.outerHTML;
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
     * @param {boolean} options.processInlineImages - Whether to process inline images with LLM (default: true)
     * @param {number} options.timeoutMs - Total timeout for LLM processing (default: 30000)
     * @returns {Promise<string>} Markdown content with cover image and description
     */
    async convertWithMetadata(html, options = {}) {
        const { 
            includeCoverImage = true, 
            includeAIDescription = true,
            processInlineImages = true,
            timeoutMs = 120000  // 2 minutes total for reasoning models
        } = options;
        
        console.log('MarkItDown: Starting convertWithMetadata with options:', { includeCoverImage, includeAIDescription, processInlineImages, timeoutMs });
        
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const startTime = Date.now();
        
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
                    const elapsed = Date.now() - startTime;
                    const remainingTime = Math.max(timeoutMs - elapsed, 5000); // At least 5 seconds for cover
                    const description = await getLLMDescription(coverUrl, remainingTime);
                    if (description) {
                        markdown += `> **Image Description:** ${description}\n\n`;
                    }
                }
                
                markdown += '---\n\n';
            }
        }
        
        // Process inline images with LLM before Turndown conversion
        let processedHtml = html;
        if (processInlineImages && includeAIDescription) {
            // Give inline images their own generous timeout (not affected by cover image time)
            const inlineTimeout = Math.max(timeoutMs, 60000); // At least 60 seconds for inline images
            console.log(`MarkItDown: Processing inline images with ${inlineTimeout}ms timeout`);
            processedHtml = await processInlineImagesWithLLM(html, inlineTimeout);
        }
        
        // Add the converted content (using processed HTML with updated alt texts)
        markdown += this.convertClean(processedHtml);
        
        console.log(`MarkItDown: Conversion completed in ${Date.now() - startTime}ms`);
        
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
    window.processInlineImagesWithLLM = processInlineImagesWithLLM;
    window.loadConfig = loadConfig;
}
