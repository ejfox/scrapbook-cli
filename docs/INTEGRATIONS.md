# Power User Integrations

scrapbook-cli is designed to integrate seamlessly with your power user workflow. Here's how to connect it with popular tools.

## 🔍 fzf Integration

### Standalone fzf Mode

Browse all your bookmarks with fzf without launching the TUI:

```bash
# Browse and get JSON
scrapbook-cli fzf

# Browse and open in browser
scrapbook-cli fzf --open

# Browse and copy URL
scrapbook-cli fzf --copy

# Browse and extract field
scrapbook-cli fzf --field url
scrapbook-cli fzf --field title
```

### Shell Keybindings

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# Ctrl-B to browse bookmarks with fzf
bookmark-search() {
  local url=$(scrapbook-cli list --json | \
    jq -r '.[] | "\(.created_at | split("T")[0]) │ \(.source) │ \(.title // .content[0:60])"' | \
    fzf --height=50% --border --prompt="📚 Bookmark > " | \
    awk '{print $1}' | \
    xargs -I {} scrapbook-cli list --json | \
    jq -r '.[] | select(.created_at | startswith("{}")) | .url')

  if [ -n "$url" ]; then
    open "$url"
  fi
}
zle -N bookmark-search
bindkey '^b' bookmark-search
```

### fzf Preview Window

Use fzf with rich previews:

```bash
scrapbook-cli list --jsonl | \
  jq -r '"\(.scrap_id)\t\(.title // .content[0:60])"' | \
  fzf --delimiter='\t' --with-nth=2 \
      --preview='scrapbook-cli get {1}' \
      --preview-window=wrap:60%
```

## 💪 Powerlevel10k Integration

### Custom Prompt Segment

Add bookmark count to your Powerlevel10k prompt. Add to `~/.p10k.zsh`:

```bash
# Add 'scrapbook' to POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS
typeset -g POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=(
  # ... other elements ...
  scrapbook
  # ... other elements ...
)

# Define the segment
function prompt_scrapbook() {
  local count=$(scrapbook-cli list --json 2>/dev/null | jq -s 'length' 2>/dev/null)
  if [[ -n "$count" && "$count" != "0" ]]; then
    p10k segment -f 208 -i '📚' -t "$count"
  fi
}

# Optional: Show recent bookmarks count
function prompt_scrapbook_recent() {
  local recent=$(scrapbook-cli list --json 2>/dev/null | \
    jq --arg date "$(date -v-1d +%Y-%m-%d)" \
    '[.[] | select(.created_at > $date)] | length' 2>/dev/null)

  if [[ "$recent" -gt 0 ]]; then
    p10k segment -f 46 -i '✨' -t "+$recent"
  fi
}
```

### Async Updates

For better performance, cache the bookmark count:

```bash
# Add to ~/.zshrc
SCRAPBOOK_CACHE_FILE="/tmp/scrapbook_count_${USER}"
SCRAPBOOK_CACHE_TTL=300  # 5 minutes

function _scrapbook_update_cache() {
  (
    COUNT=$(scrapbook-cli list --json 2>/dev/null | jq 'length' 2>/dev/null)
    echo "$COUNT:$(date +%s)" > "$SCRAPBOOK_CACHE_FILE"
  ) &!
}

function _scrapbook_get_count() {
  if [[ -f "$SCRAPBOOK_CACHE_FILE" ]]; then
    local cache_data=$(cat "$SCRAPBOOK_CACHE_FILE")
    local count=$(echo "$cache_data" | cut -d: -f1)
    local timestamp=$(echo "$cache_data" | cut -d: -f2)
    local now=$(date +%s)

    if (( now - timestamp < SCRAPBOOK_CACHE_TTL )); then
      echo "$count"
      return
    fi
  fi

  _scrapbook_update_cache
  echo "?"
}

function prompt_scrapbook() {
  local count=$(_scrapbook_get_count)
  if [[ "$count" != "?" ]]; then
    p10k segment -f 208 -i '📚' -t "$count"
  fi
}
```

## 📊 SketchyBar Integration

SketchyBar is a macOS menu bar replacement. Show bookmark stats in your menu bar!

### Installation

1. Copy the plugin:
```bash
cp sketchybar/scrapbook.sh ~/.config/sketchybar/plugins/
chmod +x ~/.config/sketchybar/plugins/scrapbook.sh
```

2. Add to `~/.config/sketchybar/sketchybarrc`:
```bash
sketchybar --add item scrapbook right \
           --set scrapbook update_freq=300 \
                           icon=📚 \
                           icon.font="SF Pro:Semibold:15.0" \
                           label.font="SF Pro:Semibold:12.0" \
                           script="$PLUGIN_DIR/scrapbook.sh" \
           --subscribe scrapbook mouse.clicked
```

3. Reload SketchyBar:
```bash
sketchybar --reload
```

### Features

- **Display**: Shows total bookmark count and recent additions
- **Click**: Opens fzf search in a new Terminal window
- **Auto-update**: Refreshes every 5 minutes

### Advanced SketchyBar Config

Show different colors based on bookmark count:

```bash
#!/bin/bash
# Enhanced scrapbook.sh

COUNT=$(scrapbook-cli list --json 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
RECENT=$(scrapbook-cli list --json 2>/dev/null | \
  jq --arg date "$(date -v-1d +%Y-%m-%d)" \
  '[.[] | select(.created_at > $date)] | length' 2>/dev/null || echo "0")

# Color based on recent activity
if [ "$RECENT" -gt 5 ]; then
  COLOR="0xffff1a90"  # Hot pink - lots of activity
elif [ "$RECENT" -gt 0 ]; then
  COLOR="0xffff66b5"  # Light pink - some activity
else
  COLOR="0xff595959"  # Gray - no recent activity
fi

sketchybar --set "$NAME" \
  label="$COUNT (+$RECENT)" \
  label.color="$COLOR"
```

## 🐟 Fish Shell Integration

### Functions

Add to `~/.config/fish/functions/`:

```fish
# ~/.config/fish/functions/sb.fish
function sb --description "Quick bookmark search and open"
    scrapbook-cli fzf --open
end

# ~/.config/fish/functions/sb-search.fish
function sb-search --description "Search bookmarks for term"
    scrapbook-cli search $argv --json | jq -r '.[].url' | fzf | xargs open
end

# ~/.config/fish/functions/sb-random.fish
function sb-random --description "Open a random bookmark"
    scrapbook-cli list --json | jq -r '.[].url' | shuf -n 1 | xargs open
end
```

### Abbreviations

Add to `~/.config/fish/config.fish`:

```fish
abbr sbl "scrapbook-cli list --json"
abbr sbs "scrapbook-cli search"
abbr sbf "scrapbook-cli fzf"
abbr sbo "scrapbook-cli fzf --open"
```

## 🔗 Alfred/Raycast Workflows

### Alfred Workflow

Create a script filter:

```bash
#!/bin/bash
query="$1"

scrapbook-cli search "$query" --json 2>/dev/null | jq -r '.[] | {
  title: .title,
  subtitle: .url,
  arg: .url,
  icon: {
    path: "icon.png"
  }
}' | jq -s '.'
```

### Raycast Script Command

```bash
#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search Bookmarks
# @raycast.mode fullOutput
# @raycast.packageName Scrapbook

# Optional parameters:
# @raycast.icon 📚
# @raycast.argument1 { "type": "text", "placeholder": "Query" }

scrapbook-cli search "$1" --json | \
  jq -r '.[] | "\(.title)\n\(.url)\n"'
```

## 🎨 Custom Themes

### Create a Custom Theme

1. Create `~/.config/scrapbook-cli/mytheme.toml`:

```toml
[manager]
border = { fg = "#your-color" }
header = { fg = "#your-color", bold = true }
hovered = { fg = "#bg-color", bg = "#your-color", bold = true }

[preview]
border = { fg = "#your-color" }
text = { fg = "#your-color" }

[palette]
bg = "#your-bg"
fg = "#your-fg"
```

2. Use it:
```bash
scrapbook-cli --theme mytheme
```

## 🔄 Automation Examples

### Cron Job: Daily Digest

```bash
# Send daily bookmark digest email
0 9 * * * scrapbook-cli list --json | \
  jq --arg date "$(date -v-1d +%Y-%m-%d)" \
  '.[] | select(.created_at > $date)' | \
  mail -s "Daily Bookmarks" you@example.com
```

### Git Backup

```bash
#!/bin/bash
# Backup bookmarks to git daily

scrapbook-cli list --json > ~/bookmarks-backup/$(date +%Y-%m-%d).json
cd ~/bookmarks-backup
git add .
git commit -m "Backup $(date +%Y-%m-%d)"
git push
```

### Notification on New Bookmarks

```bash
#!/bin/bash
# Check for new bookmarks every hour

LAST_COUNT=$(cat /tmp/bookmark_count 2>/dev/null || echo "0")
CURRENT_COUNT=$(scrapbook-cli list --json | jq 'length')

if [ "$CURRENT_COUNT" -gt "$LAST_COUNT" ]; then
  NEW=$((CURRENT_COUNT - LAST_COUNT))
  osascript -e "display notification \"$NEW new bookmarks!\" with title \"Scrapbook\""
fi

echo "$CURRENT_COUNT" > /tmp/bookmark_count
```

## 📱 iOS Shortcuts Integration

Use the `scrapbook-cli` server mode (if available) or SSH into your machine:

```
# Shortcut action: Run Script Over SSH
ssh user@host "scrapbook-cli search '$SHORTCUT_INPUT' --json | jq -r '.[0].url'"
```

---

**Pro Tip**: Combine multiple integrations! Use SketchyBar to show your count, Powerlevel10k to show recent additions, and fzf keybindings for quick access. You'll never lose a bookmark again! 📚✨
