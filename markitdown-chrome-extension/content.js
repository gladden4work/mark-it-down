/**
 * Content Script
 * Runs on web pages to extract content
 * Especially handles YouTube-specific data extraction
 */

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getYouTubeData') {
        getYouTubeData()
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }

    if (request.action === 'getPageContent') {
        sendResponse({
            success: true,
            data: {
                html: document.documentElement.outerHTML,
                title: document.title,
                url: window.location.href
            }
        });
    }
});

/**
 * Extract YouTube video data
 */
async function getYouTubeData() {
    const data = {
        title: '',
        channel: '',
        views: '',
        likes: '',
        publishDate: '',
        duration: '',
        description: '',
        transcript: '',
        transcriptError: null
    };

    // Get title
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata');
    if (titleElement) {
        data.title = titleElement.textContent.trim();
    } else {
        // Fallback to meta tag
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) data.title = metaTitle.content;
    }

    // Get channel name
    const channelElement = document.querySelector('#channel-name a, ytd-channel-name a');
    if (channelElement) {
        data.channel = channelElement.textContent.trim();
    }

    // Get view count
    const viewsElement = document.querySelector('.view-count, ytd-video-view-count-renderer span');
    if (viewsElement) {
        data.views = viewsElement.textContent.trim();
    }

    // Get likes
    const likesElement = document.querySelector('ytd-toggle-button-renderer #text, .ytd-menu-renderer [aria-label*="like"]');
    if (likesElement) {
        data.likes = likesElement.textContent.trim() || likesElement.getAttribute('aria-label');
    }

    // Get publish date
    const dateElement = document.querySelector('#info-strings yt-formatted-string, .date');
    if (dateElement) {
        data.publishDate = dateElement.textContent.trim();
    }

    // Get duration from meta
    const durationMeta = document.querySelector('meta[itemprop="duration"]');
    if (durationMeta) {
        data.duration = durationMeta.content;
    }

    // Get description
    try {
        // Try to expand description first
        const showMoreBtn = document.querySelector('#expand, tp-yt-paper-button#more, [aria-label="Show more"]');
        if (showMoreBtn) {
            showMoreBtn.click();
            await new Promise(r => setTimeout(r, 300));
        }

        const descriptionElement = document.querySelector('#description-inline-expander, #description .content, ytd-text-inline-expander');
        if (descriptionElement) {
            data.description = descriptionElement.textContent.trim();
        }
    } catch (e) {
        console.error('Error getting description:', e);
    }

    // Try to get transcript
    try {
        data.transcript = await getYouTubeTranscript();
    } catch (e) {
        data.transcriptError = 'Transcript not available: ' + e.message;
    }

    return data;
}

/**
 * Attempt to get YouTube transcript
 */
async function getYouTubeTranscript() {
    // Method 1: Try to get from page's ytInitialPlayerResponse
    try {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            const text = script.textContent;
            if (text.includes('ytInitialPlayerResponse')) {
                const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
                if (match) {
                    const playerResponse = JSON.parse(match[1]);
                    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

                    if (captionTracks && captionTracks.length > 0) {
                        // Prefer English, otherwise take first available
                        const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
                        const captionUrl = track.baseUrl;

                        // Fetch the caption
                        const response = await fetch(captionUrl);
                        const xml = await response.text();

                        // Parse XML and extract text
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(xml, 'text/xml');
                        const texts = doc.querySelectorAll('text');

                        const transcript = Array.from(texts)
                            .map(t => t.textContent.replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
                            .join(' ')
                            .replace(/\s+/g, ' ')
                            .trim();

                        return transcript;
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error fetching transcript method 1:', e);
    }

    // Method 2: Try clicking transcript button
    try {
        // Look for "Show transcript" button
        const moreActionsBtn = document.querySelector('ytd-menu-renderer button[aria-label="More actions"]');
        if (moreActionsBtn) {
            moreActionsBtn.click();
            await new Promise(r => setTimeout(r, 500));

            const transcriptMenuItem = Array.from(document.querySelectorAll('tp-yt-paper-item, ytd-menu-service-item-renderer'))
                .find(el => el.textContent.toLowerCase().includes('transcript'));

            if (transcriptMenuItem) {
                transcriptMenuItem.click();
                await new Promise(r => setTimeout(r, 1000));

                const transcriptContainer = document.querySelector('ytd-transcript-renderer, #transcript');
                if (transcriptContainer) {
                    const segments = transcriptContainer.querySelectorAll('ytd-transcript-segment-renderer, .ytd-transcript-segment-renderer');
                    const text = Array.from(segments)
                        .map(seg => seg.textContent.trim())
                        .join(' ')
                        .replace(/\s+/g, ' ');

                    // Close transcript panel
                    const closeBtn = document.querySelector('ytd-engagement-panel-section-list-renderer button[aria-label="Close"]');
                    if (closeBtn) closeBtn.click();

                    return text;
                }
            }

            // Close menu if we opened it
            document.body.click();
        }
    } catch (e) {
        console.error('Error fetching transcript method 2:', e);
    }

    throw new Error('No transcript found');
}
