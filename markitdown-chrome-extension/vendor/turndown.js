/**
 * Turndown - HTML to Markdown converter
 * Version: 7.2.0
 * https://github.com/mixmark-io/turndown
 */

var TurndownService = (function () {
    'use strict';

    function extend(destination) {
        for (var i = 1; i < arguments.length; i++) {
            var source = arguments[i];
            for (var key in source) {
                if (source.hasOwnProperty(key)) destination[key] = source[key];
            }
        }
        return destination;
    }

    function repeat(character, count) {
        return Array(count + 1).join(character);
    }

    var blockElements = [
        'ADDRESS', 'ARTICLE', 'ASIDE', 'AUDIO', 'BLOCKQUOTE', 'BODY', 'CANVAS',
        'CENTER', 'DD', 'DIR', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
        'FOOTER', 'FORM', 'FRAMESET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
        'HGROUP', 'HR', 'HTML', 'ISINDEX', 'LI', 'MAIN', 'MENU', 'NAV', 'NOFRAMES',
        'NOSCRIPT', 'OL', 'OUTPUT', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD',
        'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
    ];

    function isBlock(node) {
        return blockElements.indexOf(node.nodeName) !== -1;
    }

    function isVoid(node) {
        return [
            'AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT',
            'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'
        ].indexOf(node.nodeName) !== -1;
    }

    function hasVoid(node) {
        return node.querySelector && node.querySelector('img, br, hr');
    }

    function meaningfulWhenBlank(node) {
        return [
            'A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TH', 'TD', 'IFRAME', 'SCRIPT',
            'AUDIO', 'VIDEO'
        ].indexOf(node.nodeName) !== -1;
    }

    function hasMeaningfulWhenBlank(node) {
        return node.querySelector && node.querySelector('img, a, iframe, script, audio, video');
    }

    function isFlankedByWhitespace(side, node) {
        var sibling = side === 'left' ? node.previousSibling : node.nextSibling;
        var regExp = side === 'left' ? / $/ : /^ /;

        if (sibling) {
            if (sibling.nodeType === 3) return regExp.test(sibling.nodeValue);
            if (sibling.nodeType === 1 && !isBlock(sibling)) return regExp.test(sibling.textContent);
        }
        return false;
    }

    function flankingWhitespace(node) {
        var leading = '', trailing = '';
        if (!node.isBlock) {
            var hasLeading = /^\s/.test(node.textContent);
            var hasTrailing = /\s$/.test(node.textContent);
            if (hasLeading && !isFlankedByWhitespace('left', node)) leading = ' ';
            if (hasTrailing && !isFlankedByWhitespace('right', node)) trailing = ' ';
        }
        return { leading: leading, trailing: trailing };
    }

    function Node(node) {
        node.isBlock = isBlock(node);
        node.isCode = node.nodeName === 'CODE' || (node.parentNode && node.parentNode.isCode);
        node.isBlank = isBlank(node);
        node.flankingWhitespace = flankingWhitespace(node);
        return node;
    }

    function isBlank(node) {
        return !isVoid(node) && !meaningfulWhenBlank(node) && /^\s*$/i.test(node.textContent) && !hasVoid(node) && !hasMeaningfulWhenBlank(node);
    }

    var rules = {};

    rules.paragraph = {
        filter: 'p',
        replacement: function (content) { return '\n\n' + content + '\n\n'; }
    };

    rules.lineBreak = {
        filter: 'br',
        replacement: function (content, node, options) { return options.br + '\n'; }
    };

    rules.heading = {
        filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        replacement: function (content, node) {
            var hLevel = Number(node.nodeName.charAt(1));
            return '\n\n' + repeat('#', hLevel) + ' ' + content + '\n\n';
        }
    };

    rules.blockquote = {
        filter: 'blockquote',
        replacement: function (content) {
            content = content.replace(/^\n+|\n+$/g, '').replace(/^/gm, '> ');
            return '\n\n' + content + '\n\n';
        }
    };

    rules.list = {
        filter: ['ul', 'ol'],
        replacement: function (content, node) {
            var parent = node.parentNode;
            if (parent.nodeName === 'LI' && parent.lastElementChild === node) return '\n' + content;
            return '\n\n' + content + '\n\n';
        }
    };

    rules.listItem = {
        filter: 'li',
        replacement: function (content, node, options) {
            content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n    ');
            var prefix = options.bulletListMarker + '   ';
            var parent = node.parentNode;
            if (parent.nodeName === 'OL') {
                var start = parent.getAttribute('start');
                var index = Array.prototype.indexOf.call(parent.children, node);
                prefix = (start ? Number(start) + index : index + 1) + '.  ';
            }
            return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
        }
    };

    rules.fencedCodeBlock = {
        filter: function (node) {
            return node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
        },
        replacement: function (content, node) {
            var className = node.firstChild.getAttribute('class') || '';
            var language = (className.match(/language-(\S+)/) || [null, ''])[1];
            var code = node.firstChild.textContent;
            return '\n\n```' + language + '\n' + code.replace(/\n$/, '') + '\n```\n\n';
        }
    };

    rules.horizontalRule = {
        filter: 'hr',
        replacement: function () { return '\n\n---\n\n'; }
    };

    rules.inlineLink = {
        filter: function (node) { return node.nodeName === 'A' && node.getAttribute('href'); },
        replacement: function (content, node) {
            var href = node.getAttribute('href');
            var title = node.title ? ' "' + node.title + '"' : '';
            return '[' + content + '](' + href + title + ')';
        }
    };

    rules.emphasis = {
        filter: ['em', 'i'],
        replacement: function (content, node, options) {
            if (!content.trim()) return '';
            return options.emDelimiter + content + options.emDelimiter;
        }
    };

    rules.strong = {
        filter: ['strong', 'b'],
        replacement: function (content, node, options) {
            if (!content.trim()) return '';
            return options.strongDelimiter + content + options.strongDelimiter;
        }
    };

    rules.code = {
        filter: function (node) {
            var isCodeBlock = node.parentNode.nodeName === 'PRE' && !node.previousSibling && !node.nextSibling;
            return node.nodeName === 'CODE' && !isCodeBlock;
        },
        replacement: function (content) {
            if (!content) return '';
            return '`' + content.replace(/\r?\n|\r/g, ' ') + '`';
        }
    };

    rules.image = {
        filter: 'img',
        replacement: function (content, node) {
            var alt = node.alt || '';
            var src = node.getAttribute('src') || '';
            var title = node.title ? ' "' + node.title + '"' : '';
            return src ? '![' + alt + '](' + src + title + ')' : '';
        }
    };

    // Table support
    rules.table = {
        filter: 'table',
        replacement: function (content) {
            return '\n\n' + content + '\n\n';
        }
    };

    rules.tableRow = {
        filter: 'tr',
        replacement: function (content, node) {
            var output = '| ' + content + '\n';
            if (node.parentNode.nodeName === 'THEAD' ||
                (node.parentNode.nodeName === 'TBODY' && node === node.parentNode.firstElementChild && !node.parentNode.previousElementSibling)) {
                var cells = node.children.length;
                output += '| ' + repeat('--- | ', cells) + '\n';
            }
            return output;
        }
    };

    rules.tableCell = {
        filter: ['th', 'td'],
        replacement: function (content) {
            return content.replace(/\n/g, ' ').trim() + ' | ';
        }
    };

    function TurndownService(options) {
        if (!(this instanceof TurndownService)) return new TurndownService(options);

        var defaults = {
            rules: rules,
            hr: '---',
            bulletListMarker: '-',
            fence: '```',
            emDelimiter: '_',
            strongDelimiter: '**',
            br: '  '
        };
        this.options = extend({}, defaults, options);
        this.rules = this.options.rules;
    }

    TurndownService.prototype = {
        turndown: function (html) {
            if (typeof html !== 'string') {
                if (html && html.nodeType === 1) html = html.outerHTML;
                else if (html && html.body) html = html.body.innerHTML;
                else return '';
            }
            var doc = new DOMParser().parseFromString(html, 'text/html');
            return this.postProcess(this.process(doc.body));
        },

        process: function (parentNode) {
            var output = '';
            var nodes = parentNode.childNodes;
            for (var i = 0; i < nodes.length; i++) {
                var node = new Node(nodes[i]);
                if (node.nodeType === 3) {
                    output += node.isCode ? node.nodeValue : this.escape(node.nodeValue);
                } else if (node.nodeType === 1) {
                    output += this.replacementForNode(node);
                }
            }
            return output;
        },

        replacementForNode: function (node) {
            var rule = this.findRule(node);
            var content = this.process(node);
            var ws = node.flankingWhitespace;
            if (ws.leading || ws.trailing) content = content.trim();
            return ws.leading + rule.replacement(content, node, this.options) + ws.trailing;
        },

        findRule: function (node) {
            for (var key in this.rules) {
                var rule = this.rules[key];
                var filter = rule.filter;
                if (typeof filter === 'string' && filter === node.nodeName.toLowerCase()) return rule;
                if (Array.isArray(filter) && filter.indexOf(node.nodeName.toLowerCase()) > -1) return rule;
                if (typeof filter === 'function' && filter.call(this, node, this.options)) return rule;
            }
            return { replacement: function (c) { return c; } };
        },

        escape: function (string) {
            return string.replace(/\s+/g, ' ');
        },

        postProcess: function (output) {
            return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '').replace(/\n{3,}/g, '\n\n');
        },

        addRule: function (key, rule) {
            this.rules[key] = rule;
            return this;
        }
    };

    return TurndownService;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TurndownService;
