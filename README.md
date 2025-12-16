# Scrapbook CLI

A cyberpunk-inspired, terminal-based interface for your digital scrapbook. Dive into your memories, search through your digital artifacts, and relive your online adventures - all from the comfort of your command line.

<img width="1902" alt="Screenshot 2024-07-07 at 10 32 56 PM" src="https://github.com/ejfox/scrapbook-cli/assets/530073/4c505956-4fa1-460e-8544-3f81becdc3cb">

<img width="1902" alt="Screenshot 2024-07-07 at 10 32 44 PM" src="https://github.com/ejfox/scrapbook-cli/assets/530073/11378745-d0dd-4987-9076-470180a1a1d3">

## Features

### Interactive TUI Mode
- Browse your entire scrapbook collection
- Fuzzy search with fzf integration
- Slick, cyberpunk-themed UI
- Lightning-fast navigation
- Quick-copy links to clipboard
- Open entries directly in your browser
- Visual type indicators for different entry sources
- Mini-map view for entries with location data
- Full-screen map view of all geotagged entries
- **Interactive graph explorer** - d3-force powered entity relationship visualization

### CLI Mode (Unix-Friendly)
- Multiple output formats: JSON, JSONL, TSV, CSV
- Field extraction for perfect piping
- AI-powered analysis with `llm` tool integration
- Composable with jq, fzf, grep, awk, curl
- Structured output for scripting and automation
- Search with reliable keyword matching
- Knowledge graph queries by entity with fuzzy matching

## Installation

```bash
npm install -g scrapbook-cli
```

## Usage

### TUI Mode (Interactive)

Launch the interactive TUI (default):

```bash
scrapbook-cli
# or explicitly
scrapbook-cli ui
```

View the full-screen map of all geotagged entries:

```bash
scrapbook-cli --map
```

### CLI Mode (Unix-Friendly)

scrapbook-cli is designed as a good Unix citizen, outputting structured data that pipes perfectly with tools like `jq`, `fzf`, `llm`, and standard commands.

#### Default Human-Readable Output

All list and search commands output beautiful, human-readable formatting by default:

```bash
# Search (beautifully formatted by default)
scrap search "ai"
# Output:
# 12/15 ◇ OpenAI announces GPT-4 Turbo
#     OpenAI has released GPT-4 Turbo, a powerful new model with improved...
#     https://openai.com/blog/gpt-4-turbo/
#
# 12/14 ▣ Deep Learning Fundamentals
#     A comprehensive guide to deep learning principles and implementation...
#     https://deeplearning.example.com
#
# 2 results found

# List with human-readable format (default)
scrap list --limit 5
```

#### Output Formats

All commands support multiple output formats for piping:

```bash
# Human-readable (default - no flag needed)
scrap search "kubernetes"

# JSON (pretty-printed)
scrap list --json

# JSON Lines (one per line, great for streaming)
scrap search "ai" --jsonl

# TSV (tab-separated, easy to parse with cut/awk)
scrap list --tsv

# CSV (for spreadsheet analysis)
scrap list --csv

# fzf-compatible format (indexed, ready to pipe to fzf)
scrap search "python" --fzf | fzf --preview 'scrap get {1}'

# With result limiting
scrap list --json --limit 10
```

#### List bookmarks

```bash
# Human-readable format (default)
scrap list

# Pretty JSON
scrap list --json

# One per line (for processing)
scrap list --jsonl

# Tab-separated (for parsing)
scrap list --tsv

# CSV for Excel/spreadsheet
scrap list --csv

# Limit to 10 most recent
scrap list --limit 10

# Combine formats and limits
scrap search "machine learning" --json --limit 5
```

#### Search bookmarks

```bash
# Human-readable search (default)
scrap search "election"

# Search with specific output formats
scrap search "kubernetes" --json
scrap search "ai" --tsv
scrap search "python" --csv
scrap search "golang" --jsonl
```

#### Get specific bookmark

```bash
# Get full bookmark as JSON
scrap get <scrap_id>

# Extract specific field (perfect for piping)
scrap get <scrap_id> --field url
scrap get <scrap_id> --field title
scrap get <scrap_id> --field tags
scrap get <scrap_id> --field summary
```

#### Query knowledge graph by entity

```bash
# Find all scraps mentioning an entity (with fuzzy matching)
scrap entity "Senator James Skoufis"

# Output connections as JSON
scrap entity "New York Attorney General" --connections

# Output graph structure
scrap entity "Skoufis" --graph

# Full data output
scrap entity "Skoufis" --json
```

#### Interactive graph explorer (Hacker Mode)

```bash
# Launch d3-force powered TUI to explore entity relationships
scrapbook-cli graph "Skoufis"

# Controls:
# ↑↓/j/k    Navigate nodes
# ENTER     Explore selected entity (recursive dive)
# E         Expand network from selected node
# L         List all scraps for selected entity
# +         Expand all connected nodes (depth++)
# SPACE     Toggle physics animation
# R         Reset simulation
# Q         Quit

# Status bar shows:
# - Network size (nodes/links)
# - Current depth
# - Expanded entities count (marked with ● in connections list)
# - Animation status (▶ Running / ⏸ Paused)

# Hacker workflow:
scrapbook-cli graph "Skoufis"
# Navigate to "New York Attorney General"
# Press E to expand that entity's network
# Watch new nodes and links appear dynamically
# Press + to expand ALL connected nodes (spider out)
# Press L to see which scraps mention the entity
```

### CLI Piping Recipes

scrapbook-cli is designed to compose beautifully with Unix tools. Use `--json`, `--jsonl`, `--tsv`, `--csv`, or `--fzf` to integrate with your workflow.

#### jq Recipes (JSON Parsing)

```bash
# Get all titles
scrap list --json | jq -r '.[].title'

# Get URLs only
scrap list --json | jq -r '.[].url'

# Get bookmarks from pinboard source
scrap list --json | jq '.[] | select(.source == "pinboard") | .url'

# Count bookmarks by source
scrap list --json | jq 'group_by(.source) | map({source: .[0].source, count: length})'

# Extract all tags (unique)
scrap list --json | jq -r '.[].tags[]' | sort | uniq

# Build a markdown reading list
scrap search "article" --json | jq -r '.[] | "- [\(.title)](\(.url))"'

# Get entries with relationships
scrap list --json | jq '.[] | select(.relationships | length > 0) | {title, relationship_count: (.relationships | length)}'

# Find most common tags
scrap list --json | jq -r '.[].tags[]' | sort | uniq -c | sort -rn | head -10

# Get random bookmark
scrap list --json | jq -r '.[].url' | shuf -n 1
```

#### fzf Integration (Interactive Selection)

```bash
# Interactive search with preview
scrap search "python" --fzf | fzf --preview 'echo {} | cut -f2-'

# Select and open in browser
scrap list --fzf | fzf | awk '{print $1}' | xargs -I {} scrap get {} --field url | xargs open

# Select and copy URL to clipboard
scrap list --fzf | fzf | awk '{print $1}' | xargs -I {} scrap get {} --field url | pbcopy

# Select entry and view full details
scrap list --fzf | fzf | awk '{print $1}' | xargs -I {} scrap get {}

# Fuzzy find with live preview of URLs
scrap list --fzf | fzf --preview 'echo {} | cut -f1 | xargs -I ID scrap get ID --field url'

# Multi-select bookmarks for bulk export
scrap search "research" --fzf | fzf -m | awk '{print $1}' | xargs -I {} scrap get {} --json > research-batch.json
```

#### CSV Export

```bash
# Export to CSV for spreadsheet analysis
scrap list --csv > bookmarks.csv

# Export search results to CSV
scrap search "python" --csv > python-bookmarks.csv
```

#### Search & Entity Operations

```bash
# Find all mentions of entity, extract titles
scrap entity "OpenAI" --json | jq -r '.scraps[].title'

# Get all scraps for an entity as JSON
scrap entity "Claude" --json | jq '.scraps' > claude-mentions.json

# Get entity connection count
scrap entity "Tesla" --json | jq '.total_scraps'
```

#### Bulk Operations & Backup

```bash
# Export entire library as JSON
scrap list --json > my-scrapbook.json

# Backup to JSONL (one record per line, better for version control)
scrap list --jsonl > scrapbook-backup.jsonl

# Create a dated backup
scrap list --json > "scrapbook-$(date +%Y-%m-%d).json"

# Count total bookmarks
scrap list --json | jq 'length'

# Get stats: count by source
scrap list --json | jq 'group_by(.source) | map({source: .[0].source, count: length})'

# Export URLs only (one per line)
scrap list --json | jq -r '.[].url' > all-urls.txt

# Export titles only
scrap list --json | jq -r '.[].title' > all-titles.txt
```

#### LLM-Ready Output (Pipe to External Tools)

scrapbook-cli outputs are optimized for piping to external LLM CLI tools like `llm`, `gpt-cli`, etc.

```bash
# Pipe summaries to llm for analysis
scrap list --json --limit 10 | jq -r '.[].summary' | llm -m gpt-4o-mini "Summarize these into 3-5 topics"

# Analyze search results
scrap search "climate" --json | jq -r '.[] | "\(.title): \(.summary)"' | llm "Extract main policy proposals"

# Generate tags from titles
scrap list --json | jq -r '.[] | select(.tags | length == 0) | .title' | llm "Suggest 3 tags for each"

# Extract themes from content
scrap search "technology" --json | jq -r '.[].content' | llm "List the main technical themes"

# Analyze entity relationships
scrap entity "OpenAI" --json | jq -r '.scraps[].title' | llm "What are the main topics?"

# Create reading list with AI summaries
scrap search "research" --json | jq -r '.[] | .title' | llm "Rank these by importance"

# Compare bookmarks
(scrap get <id1> --field summary && echo "---" && scrap get <id2> --field summary) | llm "Compare these concepts"
```

#### Setup (Alias & Dev Mode)

If you're developing scrapbook-cli, you can set up a dev alias:

```bash
# Link to your local development version
cd /path/to/scrapbook-cli
npm link

# Create a short alias in ~/.zshrc or ~/.bashrc
alias scrap="scrapbook-cli"

# Now all changes to the code are immediately available
scrap search "test"  # Uses your local dev version
```

### YouTube Playlist & Transcription Workflows

Create yt-dlp playlists and Whisper transcriptions for video essay research:

```bash
# Generate playlist filtered by entity
scrapbook-cli youtube generate --entity "Palantir" -o palantir.txt

# Download and transcribe automatically
scrapbook-cli youtube transcribe \
  --entity "Peter Thiel" \
  --output-dir ./transcripts \
  --model base

# Filter by tags for themed playlists
scrapbook-cli youtube generate \
  --tag AI --tag machinelearning \
  -o ai-videos.txt

# Download with yt-dlp
yt-dlp -a ai-videos.txt --write-auto-sub --sub-lang en

# Analyze transcripts with llm
cat transcripts/*.txt | llm "Summarize the main themes"

# View collection stats
scrapbook-cli youtube stats
```

See [YOUTUBE-WORKFLOWS.md](./YOUTUBE-WORKFLOWS.md) for complete video essay research workflows.

## Power User Integrations

scrapbook-cli integrates seamlessly with your power user workflow:

- **fzf**: Standalone fuzzy finder mode (`scrapbook-cli fzf`)
- **Zsh/Fish completions**: Tab completion for all commands
- **Powerlevel10k**: Show bookmark count in your prompt
- **SketchyBar**: Display bookmark stats in your macOS menu bar
- **Shell keybindings**: Quick access with Ctrl+B
- **Alfred/Raycast**: Search workflows

See [INTEGRATIONS.md](./docs/INTEGRATIONS.md) for detailed setup instructions.

### Controls (List Mode)

- `↑/↓` or `j/k`: Navigate entries
- `→`: Copy public URL to clipboard
- `←`: Copy entry URL to clipboard
- `Space`: Open entry in browser
- `e`: Open entry in $EDITOR (nvim/vim/etc)
- `z`: Toggle full-screen summary view
- `/` or `s`: Search entries
- `r`: Refresh entries
- `PageUp/PageDown`: Move 24 entries at a time
- `Esc`: Exit search or full-screen view
- `q`: Quit

### Controls (Map Mode)

- `↑/↓`: Navigate through map markers
- `q`: Quit

## Mini-Map Feature

The mini-map displays the location of the currently selected entry if it has latitude and longitude data. If an entry doesn't have location data, the mini-map will be hidden.

## Full-Screen Map View

The full-screen map view shows all your geotagged entries on a world map. Navigate through the markers to see details about each entry.

## JSON Export

Use the `json` command followed by a scrap ID to get the full JSON data for that specific scrap. This is useful for debugging or data export purposes.

## Configuration

Scrapbook CLI uses environment variables for configuration. Create a `.env` file in your home directory with the following:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Acknowledgements

Built with love, caffeine, and a dash of cyberpunk nostalgia. Special thanks to the creators of blessed, blessed-contrib, and Supabase for making this CLI possible.
