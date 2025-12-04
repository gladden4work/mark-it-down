/**
 * Data Format Converters
 * Handles CSV, JSON, and XML conversion to Markdown
 */

const DataConverter = {
    /**
     * Detect data type from content
     * @param {string} content - Raw content
     * @returns {string} Type: 'json', 'csv', 'xml', or 'unknown'
     */
    detectType(content) {
        const trimmed = content.trim();

        // JSON detection
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                JSON.parse(trimmed);
                return 'json';
            } catch (e) { }
        }

        // XML detection
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
            try {
                new DOMParser().parseFromString(trimmed, 'text/xml');
                return 'xml';
            } catch (e) { }
        }

        // CSV detection (has commas and newlines, consistent column count)
        const lines = trimmed.split('\n');
        if (lines.length > 1) {
            const firstLineCommas = (lines[0].match(/,/g) || []).length;
            if (firstLineCommas > 0) {
                const allMatch = lines.slice(0, 5).every(line => {
                    const commas = (line.match(/,/g) || []).length;
                    return Math.abs(commas - firstLineCommas) <= 1;
                });
                if (allMatch) return 'csv';
            }
        }

        return 'unknown';
    },

    /**
     * Convert JSON to Markdown
     * @param {string} jsonString - JSON content
     * @returns {string} Markdown
     */
    convertJson(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            const formatted = JSON.stringify(data, null, 2);
            return '```json\n' + formatted + '\n```';
        } catch (e) {
            return '**Error parsing JSON:** ' + e.message + '\n\n```\n' + jsonString + '\n```';
        }
    },

    /**
     * Convert CSV to Markdown table
     * @param {string} csvString - CSV content
     * @returns {string} Markdown table
     */
    convertCsv(csvString) {
        const lines = csvString.trim().split('\n');
        if (lines.length === 0) return '';

        const rows = lines.map(line => this.parseCSVLine(line));

        if (rows.length === 0) return '';

        // Build markdown table
        let markdown = '';

        // Header
        markdown += '| ' + rows[0].join(' | ') + ' |\n';
        markdown += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';

        // Data rows
        for (let i = 1; i < rows.length; i++) {
            markdown += '| ' + rows[i].join(' | ') + ' |\n';
        }

        return markdown;
    },

    /**
     * Parse a single CSV line (handles quoted values)
     * @param {string} line - CSV line
     * @returns {string[]} Array of values
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());

        return result;
    },

    /**
     * Convert XML to Markdown
     * @param {string} xmlString - XML content
     * @returns {string} Markdown
     */
    convertXml(xmlString) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlString, 'text/xml');

            // Check for parse errors
            const parseError = doc.querySelector('parsererror');
            if (parseError) {
                return '**Error parsing XML**\n\n```xml\n' + xmlString + '\n```';
            }

            // Try to detect RSS/Atom feeds
            if (doc.querySelector('rss, feed, channel')) {
                return this.convertFeed(doc);
            }

            // Default: pretty-print as code block
            const serializer = new XMLSerializer();
            const formatted = this.formatXml(serializer.serializeToString(doc));
            return '```xml\n' + formatted + '\n```';
        } catch (e) {
            return '**Error parsing XML:** ' + e.message + '\n\n```\n' + xmlString + '\n```';
        }
    },

    /**
     * Convert RSS/Atom feed to Markdown
     * @param {Document} doc - Parsed XML document
     * @returns {string} Markdown
     */
    convertFeed(doc) {
        let markdown = '';

        // RSS format
        const channel = doc.querySelector('channel');
        if (channel) {
            const title = channel.querySelector('title')?.textContent;
            const description = channel.querySelector('description')?.textContent;

            if (title) markdown += `# ${title}\n\n`;
            if (description) markdown += `${description}\n\n`;

            const items = doc.querySelectorAll('item');
            items.forEach((item, index) => {
                const itemTitle = item.querySelector('title')?.textContent;
                const itemLink = item.querySelector('link')?.textContent;
                const itemDesc = item.querySelector('description')?.textContent;
                const pubDate = item.querySelector('pubDate')?.textContent;

                if (itemTitle) {
                    if (itemLink) {
                        markdown += `## [${itemTitle}](${itemLink})\n`;
                    } else {
                        markdown += `## ${itemTitle}\n`;
                    }
                }
                if (pubDate) markdown += `*${pubDate}*\n\n`;
                if (itemDesc) markdown += `${itemDesc}\n\n`;
                if (index < items.length - 1) markdown += '---\n\n';
            });
        }

        // Atom format
        const feed = doc.querySelector('feed');
        if (feed && !channel) {
            const title = feed.querySelector('title')?.textContent;
            if (title) markdown += `# ${title}\n\n`;

            const entries = doc.querySelectorAll('entry');
            entries.forEach((entry, index) => {
                const entryTitle = entry.querySelector('title')?.textContent;
                const entryLink = entry.querySelector('link')?.getAttribute('href');
                const summary = entry.querySelector('summary, content')?.textContent;
                const updated = entry.querySelector('updated')?.textContent;

                if (entryTitle) {
                    if (entryLink) {
                        markdown += `## [${entryTitle}](${entryLink})\n`;
                    } else {
                        markdown += `## ${entryTitle}\n`;
                    }
                }
                if (updated) markdown += `*${updated}*\n\n`;
                if (summary) markdown += `${summary}\n\n`;
                if (index < entries.length - 1) markdown += '---\n\n';
            });
        }

        return markdown || '```xml\n' + doc.documentElement.outerHTML + '\n```';
    },

    /**
     * Format XML with indentation
     * @param {string} xml - Raw XML string
     * @returns {string} Formatted XML
     */
    formatXml(xml) {
        let formatted = '';
        let indent = '';

        xml.split(/>\s*</).forEach(node => {
            if (node.match(/^\/\w/)) indent = indent.substring(2);
            formatted += indent + '<' + node + '>\n';
            if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith('?')) indent += '  ';
        });

        return formatted.substring(1, formatted.length - 2);
    },

    /**
     * Auto-detect and convert data
     * @param {string} content - Raw content
     * @returns {string} Markdown
     */
    convert(content) {
        const type = this.detectType(content);

        switch (type) {
            case 'json': return this.convertJson(content);
            case 'csv': return this.convertCsv(content);
            case 'xml': return this.convertXml(content);
            default: return '```\n' + content + '\n```';
        }
    }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.DataConverter = DataConverter;
}
