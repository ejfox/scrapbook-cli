# YouTube Playlist & Transcription Workflows

**Advanced research workflows for video essay creation, content analysis, and knowledge synthesis.**

---

## Overview

`youtube-playlist.mjs` extends scrapbook-cli with YouTube-specific features:
- **Generate yt-dlp playlists** from your bookmarks
- **Filter by tags, entities, or search queries**
- **Download videos automatically** with yt-dlp
- **Transcribe with Whisper** for searchable text
- **Combine with knowledge graph** for themed research collections

---

## Quick Start

### 1. Generate a Simple Playlist

```bash
# Get all your YouTube bookmarks as a yt-dlp playlist
scrapbook-cli youtube generate -o my-playlist.txt

# Download them
yt-dlp -a my-playlist.txt
```

### 2. Filter by Tags

```bash
# Create a playlist of machine learning tutorials
scrapbook-cli youtube generate \
  --tag machinelearning \
  --tag tutorial \
  -o ml-tutorials.txt

# Download with subtitles
yt-dlp -a ml-tutorials.txt --write-auto-sub --sub-lang en
```

### 3. Use Knowledge Graph Entities

```bash
# Get all videos mentioning "Peter Thiel"
scrapbook-cli youtube generate \
  --entity "Peter Thiel" \
  --format json \
  -o thiel-videos.json

# Get all videos about "Palantir"
scrapbook-cli youtube generate \
  --entity "Palantir" \
  -o palantir-videos.txt
```

### 4. Combined Filters

```bash
# AI videos from 2025 with "GPT" in title/description
scrapbook-cli youtube generate \
  --tag AI \
  --search "GPT" \
  --after 2025-01-01 \
  -o gpt-2025.txt
```

---

## Video Essay Research Workflow

### Use Case: Creating a Documentary About Tech Surveillance

#### Step 1: Generate Themed Playlists

```bash
# Palantir coverage
scrapbook-cli youtube generate --entity "Palantir" -o palantir.txt

# Surveillance capitalism
scrapbook-cli youtube generate --tag surveillance -o surveillance.txt

# Peter Thiel commentary
scrapbook-cli youtube generate --entity "Peter Thiel" -o thiel.txt
```

#### Step 2: Download Videos

```bash
# Download with metadata and subtitles
yt-dlp -a palantir.txt \
  --write-auto-sub \
  --sub-lang en \
  --write-info-json \
  -o "./research/palantir/%(title)s.%(ext)s"

yt-dlp -a surveillance.txt \
  --write-auto-sub \
  --sub-lang en \
  -o "./research/surveillance/%(title)s.%(ext)s"
```

#### Step 3: Transcribe with Whisper

```bash
# Transcribe entire playlists
scrapbook-cli youtube transcribe \
  --entity "Palantir" \
  --output-dir ./transcripts/palantir \
  --model base

# Or just audio extraction for analysis
scrapbook-cli youtube download \
  --entity "Peter Thiel" \
  --audio-only \
  --output-dir ./audio/thiel
```

#### Step 4: Analyze Transcripts

```bash
# Search transcripts for key terms
grep -r "surveillance" ./transcripts/ | wc -l

# Pipe to llm for analysis
cat ./transcripts/palantir/*.txt | \
  llm "Summarize the main criticisms of Palantir in these transcripts"

# Extract quotes about specific topics
grep -A 3 -B 3 "ICE" ./transcripts/palantir/*.txt > ice-quotes.txt
```

---

## Advanced Use Cases

### 1. Build a Research Corpus by Entity Network

Explore an entity's network and download all related videos:

```bash
# Start with Palantir
scrapbook-cli entity "Palantir" --connections | \
  jq -r '.connections[].entity' | \
  while read entity; do
    echo "Downloading videos about: $entity"
    scrapbook-cli youtube generate \
      --entity "$entity" \
      -o "./playlists/${entity}.txt"
  done

# Now you have playlists for:
# - Palantir
# - Peter Thiel (co-founder)
# - Alex Karp (CEO)
# - ICE (customer)
# - DoD (customer)
# etc.
```

### 2. Time-Series Analysis

Track how coverage of a topic evolves:

```bash
# 2024 AI coverage
scrapbook-cli youtube generate \
  --tag AI \
  --after 2024-01-01 \
  --before 2024-12-31 \
  -o ai-2024.txt

# 2025 AI coverage
scrapbook-cli youtube generate \
  --tag AI \
  --after 2025-01-01 \
  -o ai-2025.txt

# Compare
echo "2024: $(wc -l < ai-2024.txt) videos"
echo "2025: $(wc -l < ai-2025.txt) videos"
```

### 3. Automated Citation Database

Build a searchable database of video sources:

```bash
# Export all videos with full metadata
scrapbook-cli youtube generate \
  --tag documentary \
  --format json \
  -o documentaries.json

# Import into SQLite for querying
cat documentaries.json | \
  jq -r '.[] | [.title, .url, .summary, .tags|join(",")] | @csv' > docs.csv

sqlite3 citations.db <<EOF
CREATE TABLE videos (title TEXT, url TEXT, summary TEXT, tags TEXT);
.mode csv
.import docs.csv videos
SELECT * FROM videos WHERE tags LIKE '%surveillance%';
EOF
```

### 4. Multi-Source Video Essays

Combine YouTube with other video platforms:

```bash
# Get YouTube videos
scrapbook-cli youtube generate --tag "AI ethics" -o yt.txt

# Get Vimeo bookmarks (if you have them)
scrapbook-cli list --json | \
  jq -r '.[] | select(.url | contains("vimeo.com")) | .url' > vimeo.txt

# Combine playlists
cat yt.txt vimeo.txt > all-videos.txt

# Download all
yt-dlp -a all-videos.txt
```

---

## Whisper Transcription Deep Dive

### Models and Trade-offs

```bash
# Tiny (fastest, least accurate)
scrapbook-cli youtube transcribe \
  --entity "Elon Musk" \
  --model tiny \
  --output-dir ./quick-transcripts

# Base (good balance)
scrapbook-cli youtube transcribe \
  --tag tutorial \
  --model base \
  --output-dir ./transcripts

# Large (most accurate, slowest)
scrapbook-cli youtube transcribe \
  --entity "Curtis Yarvin" \
  --model large \
  --keep-audio \
  --output-dir ./high-quality
```

### Post-Processing Transcripts

```bash
# Extract all transcripts into one corpus
cat transcripts/*.txt > corpus.txt

# Get word frequency
cat corpus.txt | tr ' ' '\n' | sort | uniq -c | sort -rn | head -20

# Search for concepts
grep -i "democracy\|authoritarianism\|governance" corpus.txt > political-terms.txt

# Feed to LLM for analysis
cat corpus.txt | llm \
  "Extract the 10 most important themes from these video transcripts"
```

### Building a Searchable Video Archive

```bash
# Transcribe everything
scrapbook-cli youtube transcribe \
  --output-dir ./archive \
  --model base

# Index with ripgrep
rg "surveillance capitalism" ./archive/

# Create a simple search interface
cat > search.sh <<'EOF'
#!/bin/bash
QUERY="$1"
echo "Searching for: $QUERY"
rg -i "$QUERY" ./archive/ | \
  awk -F: '{print $1}' | \
  sort -u | \
  while read file; do
    echo "---"
    echo "File: $file"
    rg -C 2 -i "$QUERY" "$file"
  done
EOF

chmod +x search.sh
./search.sh "Peter Thiel"
```

---

## Integration with llm Tool

Simon Willison's `llm` tool works great with video transcripts:

### Summarization

```bash
# Summarize a single video
cat transcripts/palantir-documentary.txt | \
  llm "Summarize this documentary in 3 paragraphs"

# Summarize a collection
cat transcripts/*.txt | \
  llm "What are the main themes across these videos?"
```

### Question Answering

```bash
# Ask specific questions
cat transcripts/peter-thiel-interview.txt | \
  llm "What does Thiel say about democracy in this interview?"

# Multi-document QA
cat transcripts/surveillance/*.txt | \
  llm "What criticisms of facial recognition appear in these videos?"
```

### Extract Structured Data

```bash
# Extract quotes
cat transcripts/*.txt | \
  llm "Extract all direct quotes about 'Silicon Valley' as a JSON array"

# Build citation list
cat transcripts/*.txt | \
  llm -s "Output format: - [Speaker] said 'quote' (timestamp)" \
  "Extract notable quotes about authoritarianism"
```

---

## Statistics and Discovery

### Analyze Your YouTube Collection

```bash
# Get overview stats
scrapbook-cli youtube stats

# Output:
# Total YouTube videos: 56
#
# Top 10 Tags:
#   video                          37 videos
#   education                      18 videos
#   tutorial                       14 videos
#   ...
#
# Videos by Year:
#   2024: 12 videos
#   2025: 44 videos
```

### Find Gaps in Your Research

```bash
# What entities have you bookmarked videos about?
scrapbook-cli list --json | \
  jq -r '.[] | select(.url | contains("youtube.com")) | .relationships[]?.source' | \
  sort | uniq -c | sort -rn

# What tags do you under-collect?
scrapbook-cli youtube stats | \
  grep "videos$" | \
  awk '{print $NF, $1}' | \
  sort -n | head -10
```

---

## Real-World Example: Palantir Research Project

Let's walk through a complete research workflow:

### Goal: Understand Palantir's Surveillance Infrastructure

#### Phase 1: Collection

```bash
# Create research directory
mkdir -p palantir-research/{videos,audio,transcripts,analysis}

# Get all Palantir-related videos
scrapbook-cli youtube generate \
  --entity "Palantir" \
  --format json \
  -o palantir-research/playlist.json

# Also get videos about related entities
for entity in "ICE" "Peter Thiel" "Alex Karp"; do
  scrapbook-cli youtube generate \
    --entity "$entity" \
    -o "palantir-research/${entity}.txt"
done
```

#### Phase 2: Download & Transcribe

```bash
# Download all videos
yt-dlp -a palantir-research/playlist.json \
  --write-auto-sub \
  --sub-lang en \
  --write-info-json \
  -o "palantir-research/videos/%(title)s.%(ext)s"

# Transcribe with Whisper
scrapbook-cli youtube transcribe \
  --entity "Palantir" \
  --output-dir palantir-research/transcripts \
  --model base
```

#### Phase 3: Analysis

```bash
# Find all mentions of surveillance capabilities
grep -r -i "surveillance\|tracking\|monitoring" \
  palantir-research/transcripts/ > \
  palantir-research/analysis/surveillance-refs.txt

# Extract ICE-specific content
grep -r -A 5 -B 5 "ICE\|immigration" \
  palantir-research/transcripts/ > \
  palantir-research/analysis/ice-content.txt

# Get AI summary of findings
cat palantir-research/transcripts/*.txt | \
  llm "Analyze Palantir's surveillance capabilities as described in these videos. Focus on: 1) Technical capabilities, 2) Government clients, 3) Ethical concerns" \
  > palantir-research/analysis/summary.md
```

#### Phase 4: Citation & Export

```bash
# Build bibliography
cat palantir-research/playlist.json | \
  jq -r '.[] | "- [\(.title)](\(.url)) - Bookmarked: \(.created_at)"' \
  > palantir-research/bibliography.md

# Export key quotes
cat palantir-research/transcripts/*.txt | \
  llm "Extract the 10 most damning quotes about Palantir's practices, with context" \
  >> palantir-research/analysis/key-quotes.md
```

---

## CLI Reference

### `generate` - Create Playlists

```bash
scrapbook-cli youtube generate [options]

Options:
  --tag <tags...>       Filter by tags (multiple allowed)
  --entity <entity>     Filter by knowledge graph entity
  --search <query>      Search in titles/descriptions
  --after <YYYY-MM-DD>  Only videos after date
  --before <YYYY-MM-DD> Only videos before date
  -o, --output <file>   Output file (default: playlist.txt)
  --format <format>     Output format: txt, json, m3u (default: txt)
```

### `download` - Download Videos

```bash
scrapbook-cli youtube download [options]

Options:
  --tag <tags...>           Filter by tags
  --entity <entity>         Filter by entity
  --search <query>          Search query
  -o, --output-dir <dir>    Download directory
  --audio-only              Download audio only (MP3)
  --subs                    Download subtitles
```

### `transcribe` - Transcribe with Whisper

```bash
scrapbook-cli youtube transcribe [options]

Options:
  --entity <entity>         Filter by entity
  --tag <tags...>           Filter by tags
  --search <query>          Search query
  -o, --output-dir <dir>    Output directory
  --model <model>           Whisper model (tiny, base, small, medium, large)
  --keep-audio              Keep downloaded audio files
```

### `stats` - Analyze Collection

```bash
scrapbook-cli youtube stats
```

---

## Tips & Best Practices

### 1. Start Specific, Expand Later

```bash
# Start narrow
scrapbook-cli youtube generate --entity "Palantir" --tag surveillance

# Then expand
scrapbook-cli youtube generate --entity "Palantir"

# Then related entities
scrapbook-cli youtube generate --entity "ICE"
```

### 2. Use JSON Format for Metadata

```bash
# JSON preserves all metadata
scrapbook-cli youtube generate \
  --entity "Peter Thiel" \
  --format json \
  -o thiel.json

# Query it later
cat thiel.json | jq '.[] | select(.tags | contains(["politics"]))'
```

### 3. Incremental Transcription

```bash
# Transcribe doesn't re-transcribe existing files
scrapbook-cli youtube transcribe \
  --tag AI \
  --output-dir ./transcripts

# Run again to catch new videos
scrapbook-cli youtube transcribe \
  --tag AI \
  --output-dir ./transcripts
```

### 4. Combine with Git for Versioning

```bash
mkdir video-research
cd video-research
git init

# Generate initial playlist
node ../youtube-playlist.mjs generate \
  --entity "Curtis Yarvin" \
  -o yarvin-videos.txt

git add yarvin-videos.txt
git commit -m "Initial Yarvin video collection"

# Later, regenerate and see what changed
node ../youtube-playlist.mjs generate \
  --entity "Curtis Yarvin" \
  -o yarvin-videos.txt

git diff yarvin-videos.txt
# Shows new videos you've bookmarked
```

---

## Troubleshooting

### yt-dlp Not Found

```bash
# Install yt-dlp
pip install yt-dlp
# or
brew install yt-dlp
```

### Whisper Not Found

```bash
# Install Whisper
pip install openai-whisper
```

### Rate Limiting

```bash
# Add delays between downloads
yt-dlp -a playlist.txt --sleep-interval 5 --max-sleep-interval 10
```

### Large Transcripts

```bash
# Use smaller model for speed
scrapbook-cli youtube transcribe --model tiny

# Or process in chunks
split -l 10 playlist.txt playlist-chunk-
for chunk in playlist-chunk-*; do
  yt-dlp -a "$chunk"
  # transcribe
done
```

---

## Future Enhancements

Ideas for extending this workflow:

1. **Automatic chapter extraction** from timestamps
2. **Speaker diarization** with pyannote.audio
3. **Sentiment analysis** on transcripts
4. **Topic modeling** across video collections
5. **Auto-generate video essay scripts** from transcripts
6. **Integration with Obsidian** for note-taking
7. **Web UI** for browsing and searching videos
8. **Collaboration features** (shared playlists)

---

## Contributing

Got ideas for video research workflows? Open an issue or PR!

Repository: https://github.com/ejfox/scrapbook-cli

---

Tags: #youtube #research #transcription #whisper #yt-dlp #video-essays #knowledge-graph
