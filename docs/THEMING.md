# Scrapbook CLI Theming

Scrapbook CLI now uses a **TOML-based theming system** inspired by your other TUI tools like Yazi, matching your dotfiles aesthetic.

## Theme Format

Themes are defined in TOML files with sections for each UI component:

```toml
# vulpes-reddishnovember-dark.toml

[manager]
# Main table/list view
border = { fg = "#595959" }
header = { fg = "#ff1a90", bold = true }
hovered = { fg = "#0d0d0d", bg = "#e60067", bold = true }

[preview]
# Right sidebar preview box
border = { fg = "#ff1a90" }
label = { fg = "#ff1a90", bold = true }
text = { fg = "#f2cfdf" }

[palette]
# Base colors
bg = "#0d0d0d"
fg = "#f2cfdf"
pink = "#ff1a90"
```

## Project Structure

```
scrapbook-cli/
├── themes.js            # TOML theme loader (root level)
├── themes/              # Theme directory
│   └── vulpes-reddishnovember-dark.toml
└── config/              # YAML config (separate from themes)
    ├── loader.js
    └── themes.yaml      # Legacy theme presets
```

## Theme Locations

Themes are loaded from (in order of precedence):

1. **User themes**: `~/.config/scrapbook-cli/*.toml`
2. **Project themes**: `./themes/*.toml`
3. **Default theme**: Vulpes Reddish

## Current Theme: Vulpes Reddishnovember Dark

Matches your dotfiles theme palette:

### Colors
- **Background**: `#0d0d0d` (deep black)
- **Foreground**: `#f2cfdf` (warm pink-white)
- **Primary**: `#ff1a90` (hot pink)
- **Selection**: `#e60067` (bright red)
- **Dim**: `#595959` (gray)

### UI Components

#### `[manager]` - Main Table
- Border: Gray (#595959)
- Header: Pink (#ff1a90)
- Selected row: Bright red bg (#e60067), dark text
- Date column: Dimmed gray
- Content: Warm white

#### `[preview]` - Right Sidebar
- Border: Pink
- META-summary marker: Hot pink (◈)
- Stats indicators: Various pinks/magentas
- Keyboard shortcuts: Pink highlights

#### `[status]` - Bottom Bar
- Border: Pastel pink (#ff66b5)
- Info text: Warm white

#### `[map]` - Location View
- Border: Hot pink (#ff279a)
- Shape/Marker: Pink (#ff1a90)

#### `[fullscreen]` - Detail View
- Border & scrollbar: Pink
- Field markers: Different pinks for different types
  - Title: #ff1a90
  - Content: #e60067
  - Tags: #ff0095
  - URLs: #ff10ab

#### `[icons]` - Nerd Font Icons
- Source indicators:  ,  ,  ,
- Content types:  ,  ,  ,
- UI symbols: ◆ ▶ • ◇ ○ ● ◈
- Metadata: (tags) (links) (location)

## Creating Custom Themes

1. Copy an existing theme:
   ```bash
   cp themes/vulpes-reddishnovember-dark.toml ~/.config/scrapbook-cli/my-theme.toml
   ```

2. Edit colors in your favorite editor:
   ```toml
   [manager]
   border = { fg = "#your-color" }
   hovered = { fg = "#text", bg = "#bg", bold = true }
   ```

3. Reload scrapbook-cli to see changes

## Theme Sections Reference

### Required Sections
- `[manager]` - Main table view
- `[preview]` - Preview sidebar
- `[status]` - Status bar
- `[palette]` - Color definitions

### Optional Sections
- `[map]` - Mini-map view
- `[fullscreen]` - Expanded detail view
- `[search]` - Search dialog
- `[help]` - Help overlay
- `[relationships]` - Relationship view
- `[force_layout]` - Graph view
- `[icons]` - Icon definitions
- `[animation]` - Animation settings

### Color Properties

Each component can have:
- `fg` - Foreground color (hex)
- `bg` - Background color (hex)
- `bold` - Bold text (true/false)
- `underline` - Underlined (true/false)
- `italic` - Italic text (true/false)

## Matching Your Ecosystem

This theme system matches:
- **Yazi**: Same TOML structure with sections
- **tmux**: Same color palette (vulpes-reddish2-dark)
- **Ghostty**: Same terminal colors
- **Overall vibe**: High-contrast dark with red/pink/magenta accents

All your TUI tools now share a cohesive visual language! 🎨
