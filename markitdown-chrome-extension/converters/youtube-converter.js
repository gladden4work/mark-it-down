/**
 * YouTube Transcript Converter
 * Extracts video metadata and transcripts from YouTube pages
 */

const YouTubeConverter = {
    /**
     * Check if URL is a YouTube video
     * @param {string} url - URL to check
     * @returns {boolean}
     */
    isYouTubeVideo(url) {
        return url && (
            url.includes('youtube.com/watch') ||
            url.includes('youtu.be/')
        );
    },

    /**
     * Extract video ID from YouTube URL
     * @param {string} url - YouTube URL
     * @returns {string|null} Video ID
     */
    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    },

    /**
     * Convert YouTube page to Markdown
     * @param {Object} data - YouTube page data from content script
     * @returns {string} Markdown content
     */
    convert(data) {
        let markdown = '# YouTube\n\n';

        if (data.title) {
            markdown += `## ${data.title}\n\n`;
        }

        // Video metadata
        const stats = [];
        if (data.views) stats.push(`- **Views:** ${data.views}`);
        if (data.likes) stats.push(`- **Likes:** ${data.likes}`);
        if (data.channel) stats.push(`- **Channel:** ${data.channel}`);
        if (data.publishDate) stats.push(`- **Published:** ${data.publishDate}`);
        if (data.duration) stats.push(`- **Duration:** ${data.duration}`);

        if (stats.length > 0) {
            markdown += '### Video Metadata\n';
            markdown += stats.join('\n') + '\n\n';
        }

        // Description
        if (data.description) {
            markdown += '### Description\n';
            markdown += data.description + '\n\n';
        }

        // Transcript
        if (data.transcript && data.transcript.length > 0) {
            markdown += '### Transcript\n';
            markdown += data.transcript + '\n';
        } else if (data.transcriptError) {
            markdown += `### Transcript\n*${data.transcriptError}*\n`;
        }

        return markdown;
    },

    /**
     * Parse transcript data from YouTube's internal format
     * @param {Array} segments - Transcript segments
     * @returns {string} Plain text transcript
     */
    parseTranscript(segments) {
        if (!segments || !Array.isArray(segments)) return '';

        return segments
            .map(seg => seg.text || seg.utf8 || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.YouTubeConverter = YouTubeConverter;
}
