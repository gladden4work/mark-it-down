# Copilot Instructions for MarkItDown

## Project Overview

MarkItDown is a Python utility (by Microsoft/AutoGen team) for converting various file formats (PDF, Word, Excel, PowerPoint, HTML, images, audio, etc.) to Markdown for LLM consumption.

## Architecture

### Core Components (`packages/markitdown/src/markitdown/`)

- **`_markitdown.py`** - Main `MarkItDown` class orchestrating conversions. Key methods: `convert()`, `convert_local()`, `convert_stream()`, `convert_uri()`, `register_converter()`
- **`_base_converter.py`** - `DocumentConverter` abstract base class and `DocumentConverterResult` dataclass
- **`_stream_info.py`** - `StreamInfo` dataclass for file metadata (mimetype, extension, charset, url)
- **`converters/`** - Individual converter implementations per format (e.g., `_pdf_converter.py`, `_docx_converter.py`)

### Converter Pattern

All converters inherit from `DocumentConverter` and implement:
```python
def accepts(self, file_stream: BinaryIO, stream_info: StreamInfo, **kwargs) -> bool
def convert(self, file_stream: BinaryIO, stream_info: StreamInfo, **kwargs) -> DocumentConverterResult
```

Converters are prioritized: `PRIORITY_SPECIFIC_FILE_FORMAT` (0) runs before `PRIORITY_GENERIC_FILE_FORMAT` (10).

### Package Structure

- **`packages/markitdown/`** - Main library (pip: `markitdown`)
- **`packages/markitdown-mcp/`** - MCP server for LLM integration (pip: `markitdown-mcp`)
- **`packages/markitdown-sample-plugin/`** - Plugin template with entry point pattern
- **`markitdown-chrome-extension/`** - Browser extension (separate from Python packages)

## Development Workflow

```bash
# Install with all optional dependencies
pip install -e 'packages/markitdown[all]'

# Run tests (requires hatch)
cd packages/markitdown
hatch test

# Pre-commit checks (uses Black formatter)
pre-commit run --all-files

# Type checking
hatch run types:check
```

## Key Conventions

- **Optional dependencies**: Format-specific deps are optional (e.g., `[pdf]`, `[docx]`, `[xlsx]`). Use `[all]` for full support.
- **Stream-based API**: Converters work with `BinaryIO` streams, not file paths. No temp files created.
- **Magika for type detection**: Uses Google's Magika library for content-based MIME type detection.
- **Plugin system**: Plugins register via `pyproject.toml` entry points under `markitdown.plugin` group, require `__plugin_interface_version__ = 1`.

## Adding New Converters

1. Create `converters/_myformat_converter.py` following `_html_converter.py` pattern
2. Define `ACCEPTED_MIME_TYPE_PREFIXES` and `ACCEPTED_FILE_EXTENSIONS`
3. Register in `_markitdown.py` `enable_builtins()` method
4. Export in `converters/__init__.py`
5. Add optional dependency group in `pyproject.toml` if needed

## Testing

Tests in `packages/markitdown/tests/`:
- `test_module_vectors.py` - File conversion tests using test vectors
- `test_module_misc.py` - Unit tests for helpers, StreamInfo, etc.
- `test_cli_*.py` - CLI tests
- Test files in `tests/test_files/`

## Common Patterns

```python
# Basic conversion
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert("file.pdf")
print(result.markdown)  # or result.text_content (deprecated alias)

# With LLM for image descriptions
md = MarkItDown(llm_client=openai_client, llm_model="gpt-4o")

# Enable plugins
md = MarkItDown(enable_plugins=True)
```

## Chrome Extension (`markitdown-chrome-extension/`)

Browser extension for converting web pages to Markdown (separate from Python packages).

### Architecture
- **`manifest.json`** - Chrome Manifest V3 config (permissions: activeTab, clipboardWrite, contextMenus, scripting)
- **`background.js`** - Service worker handling context menus and background operations
- **`popup.js/html/css`** - Extension popup UI for user interactions
- **`content.js`** - Content script injected into YouTube pages
- **`converters/`** - JavaScript conversion modules:
  - `html-converter.js` - Uses Turndown.js for HTML→Markdown
  - `youtube-converter.js` - Extracts YouTube video metadata/transcripts
  - `data-converter.js` - Handles data file conversions
- **`vendor/turndown.js`** - Bundled Turndown.js library

### Features
- Context menu options: convert selection, linked page, or current page
- YouTube video support with transcript extraction
- Smart content detection using semantic selectors (article, main, .content, etc.)

### Development
Load unpacked extension in Chrome: `chrome://extensions/` → Enable Developer mode → Load unpacked → Select `markitdown-chrome-extension/` folder
