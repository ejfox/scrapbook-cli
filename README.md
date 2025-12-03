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

#### List bookmarks

```bash
# JSON (pretty-printed, default)
scrapbook-cli list --json

# JSON Lines (one per line, great for streaming)
scrapbook-cli list --jsonl

# TSV (tab-separated, easy to parse)
scrapbook-cli list --tsv

# CSV
scrapbook-cli list --csv

# Limit results
scrapbook-cli list --json --limit 10
```

#### Search bookmarks

```bash
# Search with JSON output
scrapbook-cli search "election" --json

# Search with TSV
scrapbook-cli search "kubernetes" --tsv
```

#### Get specific bookmark

```bash
# Get full bookmark JSON
scrapbook-cli get <scrap_id>

# Extract specific field (perfect for piping)
scrapbook-cli get <scrap_id> --field url
scrapbook-cli get <scrap_id> --field title
scrapbook-cli get <scrap_id> --field tags
```

#### Query knowledge graph by entity

```bash
# Find all scraps mentioning an entity (with fuzzy matching)
scrapbook-cli entity "Senator James Skoufis"

# Output connections as JSON
scrapbook-cli entity "New York Attorney General" --connections

# Output graph structure
scrapbook-cli entity "Skoufis" --graph

# Full data output
scrapbook-cli entity "Skoufis" --json
```

#### Interactive graph explorer

```bash
# Launch d3-force powered TUI to explore entity relationships
scrapbook-cli graph "Skoufis"

# Navigate with arrow keys
# Press ENTER on any node to explore that entity's relationships
# Press SPACE to toggle physics animation
# Press R to reset simulation
# Press Q to quit
```

### Piping with jq

```bash
# Get all titles
scrapbook-cli list --json | jq -r '.[].title'

# Get URLs from pinboard bookmarks
scrapbook-cli list --json | jq '.[] | select(.source == "pinboard") | .url'

# Count bookmarks by source
scrapbook-cli list --json | jq 'group_by(.source) | map({source: .[0].source, count: length})'

# Get bookmarks with locations
scrapbook-cli list --json | jq '.[] | select(.location != null) | {title, location, url}'

# Extract tags
scrapbook-cli list --json | jq '.[].tags[]' | sort | uniq
```

### AI-Powered Analysis with `llm`

```bash
# Categorize bookmarks
scrapbook-cli list --json --limit 10 | jq -r '.[].title' | \
  llm -m gpt-4o-mini "Categorize these into 3-5 topic groups"

# Generate summary of recent bookmarks
scrapbook-cli list --json --limit 5 | jq -r '.[].summary' | \
  llm -m gpt-4o-mini "Create a brief digest of these bookmarks"

# Extract key themes
scrapbook-cli search "technology" --json | jq -r '.[].content' | \
  llm -m gpt-4o-mini "What are the main themes in these tech bookmarks?"

# Generate tags for untagged bookmarks
scrapbook-cli list --json | jq '.[] | select(.tags | length == 0) | .content' | \
  llm -m gpt-4o-mini "Suggest 3-5 tags for this content" -s "Output only tags, comma separated"

# Compare bookmarks
scrapbook-cli get <id1> | jq '.summary' > /tmp/a.txt
scrapbook-cli get <id2> | jq '.summary' > /tmp/b.txt
cat /tmp/a.txt /tmp/b.txt | llm "Compare these two bookmarks. What are the connections?"
```

### Classic Unix Tools

```bash
# Get URLs from TSV (8th column)
scrapbook-cli list --tsv | cut -f8 | tail -n +2

# Filter by source with awk
scrapbook-cli list --tsv | awk -F'\t' '$6 == "pinboard"'

# Count by source
scrapbook-cli list --tsv | cut -f6 | sort | uniq -c | sort -rn

# Search with grep
scrapbook-cli list --tsv | grep -i "kubernetes"

# Get a random bookmark URL
scrapbook-cli list --json | jq -r '.[].url' | shuf -n 1
```

### Power User Workflows

```bash
# Open random bookmark in browser
scrapbook-cli list --json | jq -r '.[].url' | shuf -n 1 | xargs open

# Build a reading list
scrapbook-cli search "article" --json | \
  jq -r '.[] | "- [\(.title)](\(.url))"' > reading-list.md

# Export to CSV for spreadsheet analysis
scrapbook-cli list --csv > bookmarks.csv

# Chain search -> filter -> extract -> open
scrapbook-cli search "tent camping" --json | \
  jq -r '.[] | select(.tags | contains(["outdoor"])) | .url' | head -1 | xargs open

# Find bookmarks from last week
scrapbook-cli list --jsonl | \
  jq -r 'select(.created_at > "'$(date -v-7d +%Y-%m-%d)'") | .title'
```

See [CLI-EXAMPLES.md](./docs/CLI-EXAMPLES.md) for more advanced usage patterns.

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
