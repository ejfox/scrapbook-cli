#!/bin/bash

# SketchyBar plugin for scrapbook-cli
# Shows bookmark count and provides quick search
#
# Installation:
# 1. Copy this file to ~/.config/sketchybar/plugins/scrapbook.sh
# 2. Make it executable: chmod +x ~/.config/sketchybar/plugins/scrapbook.sh
# 3. Add to sketchybarrc:
#
#    sketchybar --add item scrapbook right \
#               --set scrapbook update_freq=300 \
#                               icon=📚 \
#                               script="$PLUGIN_DIR/scrapbook.sh" \
#               --subscribe scrapbook mouse.clicked

# Get bookmark count
COUNT=$(scrapbook-cli list --json 2>/dev/null | jq 'length' 2>/dev/null || echo "?")

# Get recent bookmarks count (last 24h)
RECENT=$(scrapbook-cli list --json 2>/dev/null | \
  jq --arg date "$(date -v-1d +%Y-%m-%d)" \
  '[.[] | select(.created_at > $date)] | length' 2>/dev/null || echo "0")

# Format display
if [ "$RECENT" -gt 0 ]; then
  LABEL="$COUNT (+$RECENT)"
else
  LABEL="$COUNT"
fi

# Handle clicks
case "$SENDER" in
  "mouse.clicked")
    # Launch fzf search in a new terminal window
    osascript <<EOF
tell application "Terminal"
    do script "scrapbook-cli fzf --open"
    activate
end tell
EOF
    ;;
  *)
    # Update display
    sketchybar --set "$NAME" label="$LABEL"
    ;;
esac
