# CLI Examples - Using scrapbook-cli with Unix Tools

scrapbook-cli is designed to be a good Unix citizen, working seamlessly with tools like `jq`, `fzf`, `yazi`, `curl`, and standard pipes.

## Output Formats

All commands support multiple output formats for maximum composability:

- `--json` - Pretty-printed JSON (default for most commands)
- `--jsonl` - JSON Lines (one object per line, great for streaming)
- `--tsv` - Tab-separated values (easy to parse with `awk`, `cut`)
- `--csv` - Comma-separated values

## Basic Commands

### List all bookmarks

```bash
# Launch TUI (default)
scrapbook-cli

# List as JSON
scrapbook-cli list --json

# List as JSONL (one per line)
scrapbook-cli list --jsonl

# List as TSV
scrapbook-cli list --tsv

# Limit results
scrapbook-cli list --json --limit 10
```

### Search bookmarks

```bash
# Search and output as JSON
scrapbook-cli search "tent" --json

# Search and output as TSV
scrapbook-cli search "kubernetes" --tsv
```

### Get specific bookmark

```bash
# Get full bookmark JSON
scrapbook-cli get abc123

# Extract just the URL
scrapbook-cli get abc123 --field url

# Extract title
scrapbook-cli get abc123 --field title
```

## Combining with jq

jq is perfect for filtering and transforming bookmark data:

```bash
# Get all URLs from pinboard bookmarks
scrapbook-cli list --json | jq '.[] | select(.source == "pinboard") | .url'

# Get titles of recent bookmarks
scrapbook-cli list --json --limit 10 | jq '.[].title'

# Count bookmarks by source
scrapbook-cli list --json | jq 'group_by(.source) | map({source: .[0].source, count: length})'

# Get all tags
scrapbook-cli list --json | jq '.[].tags[]' | sort | uniq

# Find all bookmarks with "tent" in tags
scrapbook-cli list --json | jq '.[] | select(.tags | contains(["tent"]))'

# Complex query: Get URLs of bookmarks with location data
scrapbook-cli list --json | jq '.[] | select(.location != null and .location != "Unknown") | {title, location, url}'
```

## Combining with fzf

Use fzf for interactive selection:

```bash
# Fuzzy search bookmarks and open selected URL
scrapbook-cli list --jsonl | \
  jq -r '"\(.created_at | split("T")[0]) │ \(.source) │ \(.title // .content[0:80])"' | \
  fzf | \
  cut -d'│' -f1 | \
  xargs -I {} scrapbook-cli list --json | jq -r '.[] | select(.created_at | startswith("{}")) | .url' | \
  xargs open

# Simpler: Search and open
scrapbook-cli search "$(echo "" | fzf --print-query)" --json | \
  jq -r '.[].url' | \
  fzf | \
  xargs open
```

## Combining with curl

Fetch and analyze bookmarked URLs:

```bash
# Check HTTP status of all URLs
scrapbook-cli list --json | \
  jq -r '.[] | select(.url) | .url' | \
  xargs -I {} curl -o /dev/null -s -w "%{http_code} {}\n" {}

# Download all images
scrapbook-cli list --json | \
  jq -r '.[] | select(.content_type == "image") | .url' | \
  xargs -n 1 curl -O

# Fetch content from URLs and save
scrapbook-cli search "article" --json | \
  jq -r '.[] | .url' | \
  xargs -I {} sh -c 'curl -s {} | pandoc -f html -t markdown > $(echo {} | md5).md'
```

## Combining with awk/grep/cut

Classic Unix text processing:

```bash
# Get all URLs from TSV output
scrapbook-cli list --tsv | cut -f8 | tail -n +2

# Filter for recent dates
scrapbook-cli list --tsv | awk -F'\t' '$3 > "2025-01-01"'

# Count by source
scrapbook-cli list --tsv | cut -f6 | sort | uniq -c | sort -rn

# Simple grep search in TSV
scrapbook-cli list --tsv | grep -i "kubernetes"
```

## Combining with yazi

Use yazi file manager to browse bookmarks:

```bash
# Extract URLs and open in yazi
scrapbook-cli list --json | \
  jq -r '.[] | select(.url | startswith("file://")) | .url | sub("file://"; "")' | \
  xargs yazi

# Browse bookmarked directories
scrapbook-cli search "directory" --json | \
  jq -r '.[] | .metadata.path // empty' | \
  xargs -I {} yazi {}
```

## Scripting Examples

### Daily digest

```bash
#!/bin/bash
# daily-digest.sh - Show today's bookmarks

DATE=$(date +%Y-%m-%d)
echo "📚 Bookmarks from $DATE"
echo "─────────────────────────"

scrapbook-cli list --json | \
  jq --arg date "$DATE" '.[] | select(.created_at | startswith($date))' | \
  jq -r '"• \(.title // .content[0:60]) (\(.source))"'
```

### Export to Markdown

```bash
#!/bin/bash
# export-markdown.sh - Export bookmarks to markdown

echo "# My Bookmarks"
echo
echo "Generated: $(date)"
echo

scrapbook-cli list --json | \
  jq -r '.[] | "## [\(.title // "Untitled")]\(.url)\n\n\(.summary // .content[0:200] // "No description")\n\n**Source:** \(.source) | **Date:** \(.created_at | split("T")[0])\n\n**Tags:** \(.tags | join(", "))\n\n---\n"'
```

### Find related bookmarks

```bash
#!/bin/bash
# related.sh - Find bookmarks related to a tag

TAG=$1

echo "🔗 Bookmarks related to: $TAG"
echo

scrapbook-cli list --json | \
  jq --arg tag "$TAG" '.[] | select(.tags | contains([$tag]))' | \
  jq -r '"• \(.title // .content[0:60])\n  \(.url)\n"'
```

## Tips

1. **Pipe to less**: Add ` | less` to any command for paginated output
2. **Use -r with jq**: Use `jq -r` for raw output (no quotes) when piping
3. **Error handling**: Commands exit with non-zero status on error
4. **Quiet mode**: Use `loadConfig({ silent: true })` to suppress logs
5. **JSONL for streaming**: Use `--jsonl` when processing line-by-line

## Advanced: Building a bookmark pipeline

```bash
# Complete workflow: Search, filter, transform, open
scrapbook-cli search "tent camping" --jsonl | \
  jq -r 'select(.tags | contains(["outdoor"])) | .url' | \
  while read url; do
    echo "Processing: $url"
    curl -s "$url" | grep -i "alpine" && echo "$url" >> alpine-camping.txt
  done
```

## Integration with other tools

- **ripgrep**: `scrapbook-cli list --json | rg -i "pattern"`
- **bat**: `scrapbook-cli get abc123 | bat -l json`
- **delta**: `scrapbook-cli list --json > old.json; sleep 60; scrapbook-cli list --json > new.json; delta old.json new.json`
- **entr**: `echo "config.yaml" | entr scrapbook-cli list --json`

---

The key principle: scrapbook-cli outputs clean structured data that can be easily processed by standard Unix tools. No clever parsing needed!
