# Scrapbook CLI Configuration

The Scrapbook CLI now supports a flexible dotfiles-style configuration system using YAML files.

## Configuration Files

Configuration is loaded from three locations in priority order:

1. **Default Config**: `config.yaml` in the project directory (built-in defaults)
2. **User Config**: `~/.scrapbook/config.yaml` (your personal preferences)
3. **Local Config**: `.scrapbook.yaml` in current directory (project-specific overrides)

Each subsequent config file overrides values from the previous ones using deep merge.

## Setting Up Your Config

1. Create the config directory:
   ```bash
   mkdir -p ~/.scrapbook
   ```

2. Create your config file:
   ```bash
   cp config.example.yaml ~/.scrapbook/config.yaml
   ```

3. Edit the file to customize your settings

## Configuration Options

### Database & Supabase
- Supabase URL and API key (use env vars for security)
- Table name and schema
- Query defaults (limit, ordering)
- Search configuration

### Theme & Colors
- Color palette for UI elements
- Border and text colors
- Symbol customization

### Display Settings
- Column widths and minimum sizes
- Headers to show/hide
- Preview lengths

### Animations
- Enable/disable animations
- Animation speeds and delays

### Keyboard Shortcuts
- Customize any keyboard binding
- Add multiple keys for same action

### Physics (Force Layout)
- Adjust force strengths
- Damping and distances
- Animation intervals

## Example Configurations

### Minimal/Fast UI
```yaml
animations:
  summary:
    enabled: false
  force_layout:
    auto_start: false
```

### Custom Color Scheme
```yaml
theme:
  colors:
    palette:
      - "#FF1493"  # Deep Pink
      - "#00CED1"  # Dark Turquoise
      - "#FFD700"  # Gold
```

### Vim-style Navigation
```yaml
shortcuts:
  page_up: ["C-b"]       # Ctrl+B for page up
  page_down: ["C-f"]     # Ctrl+F for page down
  open_detail: ["o"]     # 'o' to open
```

### Wide Date Column
```yaml
display:
  column_widths:
    date: 25
    source: 15
    content: 60
```

### Custom Database Configuration
```yaml
# Use environment variables for credentials (recommended)
# Set SUPABASE_URL and SUPABASE_KEY in .env

database:
  table: my_scraps           # Custom table name
  order_by: updated_at        # Sort by different field
  order_direction: desc       # desc or asc
  default_limit: 500          # Limit query results

  # Search configuration
  search_columns:
    - title
    - content
    - tags
  search_type: websearch      # websearch, plain, or phrase
```

### Multiple Environments
```yaml
# config.development.yaml - Development database
database:
  table: scraps_dev
  default_limit: 100

# config.production.yaml - Production database
database:
  table: scraps
  default_limit: 1000
```

## Testing Your Config

The CLI will automatically load your config on startup. Check for the confirmation message:
```
Loaded user config from /Users/yourname/.scrapbook/config.yaml
```

If there are errors in your YAML, the CLI will fall back to defaults and show an error message.