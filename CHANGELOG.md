# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2025-12-03

### Changed

- **Repository Organization**: Reorganized project structure for clarity
  - Moved all documentation to `docs/` directory
  - Moved all integration examples to `examples/` directory
  - Removed backup and system files
- **File Naming**: Renamed core files with more descriptive names
  - `data.js` → `database.js` (database operations)
  - `ui.js` → `tui.js` (Terminal User Interface)
  - `config-cli.js` → `config-tool.js` (CLI configuration tool)
  - `theme-loader.js` → `themes.js` (theme system)
- **Documentation**: Removed emoji for clean Unix-style aesthetic
  - Updated README.md with simple, professional formatting
  - Maintained all technical content and examples

### Technical

- Updated all import statements across the codebase
- Verified all CLI commands work correctly after refactoring
- No breaking changes to API or functionality

---

## [2.0.0] - 2025-12-03

### 🎉 Major Release: Unix-Friendly CLI Mode

This release transforms scrapbook-cli from a TUI-only tool into a composable Unix citizen that integrates seamlessly with modern power-user workflows. The tool now outputs clean structured data that pipes perfectly with `jq`, `fzf`, `llm`, and standard Unix commands.

### Added

#### CLI Mode - Structured Output
- **New `list` command** with multiple output formats:
  - `--json` - Pretty-printed JSON array
  - `--jsonl` - JSON Lines (one object per line, perfect for streaming)
  - `--tsv` - Tab-separated values (easy parsing with awk/cut)
  - `--csv` - Comma-separated values
  - `--limit` flag to control result count
- **New `search` command** for keyword searching with structured output
- **New `get` command** to fetch individual bookmarks
  - `--field` flag for extracting specific fields (url, title, tags, etc.)
  - Perfect for piping: `scrapbook-cli get <id> --field url | xargs open`
- **AI Integration**: All commands work perfectly with the `llm` CLI tool
  - Categorize bookmarks with GPT
  - Generate summaries and digests
  - Extract themes and insights

#### fzf Integration
- **New `fzf` command** for standalone fuzzy finding (no TUI)
  - `--open` flag to open selection in browser
  - `--copy` flag to copy URL to clipboard
  - `--field` flag to extract specific fields
  - Full preview window support
- **Improved TUI search**: Replaced blessed textbox with native fzf
  - Suspends TUI and launches fzf for better UX
  - Tab-separated format for robust parsing (no regex fragility)

#### Power User Integrations
- **Shell completions**: Zsh and Fish tab completion
  - Works with Powerlevel10k
  - Completes commands, flags, and field names
- **SketchyBar plugin**: Display bookmark stats in macOS menu bar
  - Shows total count and recent additions
  - Click to launch fzf search
  - Auto-updates every 5 minutes
- **Comprehensive integration guide** (`INTEGRATIONS.md`):
  - Powerlevel10k prompt segments (sync and async)
  - Shell keybindings for quick access
  - fzf preview configurations
  - Fish functions and abbreviations
  - Alfred/Raycast workflows
  - Automation examples (cron, git backup, notifications)

#### Documentation
- **`CLI-EXAMPLES.md`**: Advanced piping patterns and workflows
- **`INTEGRATIONS.md`**: Detailed setup for power-user tools
- **Updated README**: Comprehensive usage examples
  - All commands tested by hand
  - jq filtering examples
  - llm integration patterns
  - Classic Unix tool examples (awk, grep, cut)

### Changed

- **Breaking**: TUI search now uses fzf instead of blessed textbox
  - Better UX, more powerful fuzzy matching
  - Preserves all existing functionality
- **Improved search reliability**: Use case-insensitive ILIKE pattern matching
  - More predictable than PostgreSQL full-text search
  - Works across content, title, and summary fields

### Fixed

- **Search crashes**: Fixed JSONB column errors in search queries
  - Removed tags and source from ILIKE operations
  - Now searches only text/varchar columns
- **Scroll reset errors**: Fixed `setScrollPerc()` to use correct blessed API
  - Changed to `setScroll(0)` with safety checks
  - Fixes crashes when navigating between scraps
- **Database timeouts**: Optimized queries to exclude heavy embedding fields
  - Reduced default limit from 1000 to 500
  - Explicit field selection instead of `SELECT *`
  - Query completes in ~1-2s instead of timing out

### Developer Experience

- **Exit codes**: Proper exit codes for scripting (0 = success, 1 = error)
- **stderr vs stdout**: Clean separation (data to stdout, errors to stderr)
- **Silent mode**: `loadConfig({ silent: true })` for piping
- **Tested examples**: Every command in docs is hand-tested and verified

### Migration Guide

The TUI mode is unchanged and works exactly as before. New CLI commands are additive:

```bash
# Old (still works)
scrapbook-cli list        # Launches TUI

# New
scrapbook-cli ui          # Explicit TUI mode
scrapbook-cli list --json # CLI mode with structured output
scrapbook-cli fzf         # Standalone fzf (no TUI)
```

### Philosophy

This release embraces the Unix philosophy: do one thing well, play nicely with others. scrapbook-cli now outputs clean structured data that composes perfectly with the modern command-line ecosystem—from classic tools like grep and awk to modern power tools like jq, fzf, and llm.

---

## [1.0.4] - 2024-07-07

### Added
- Initial TUI implementation
- Map view for geotagged bookmarks
- JSON export command
- Cyberpunk-themed UI with vulpes color scheme
- Basic search functionality

---

[2.0.0]: https://github.com/ejfox/scrapbook-cli/compare/v1.0.4...v2.0.0
[1.0.4]: https://github.com/ejfox/scrapbook-cli/releases/tag/v1.0.4
