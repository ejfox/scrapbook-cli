# Advanced Configuration Guide

## 🎨 Themes

The Scrapbook CLI comes with 10 built-in themes. Apply them instantly:

```bash
# Use a theme for one session
node index.mjs --theme cyberpunk

# Set a theme permanently
npm run config:edit
# Add: theme_preset: cyberpunk
```

### Available Themes
- **default** - Classic green terminal
- **cyberpunk** - Neon lights and magenta/cyan
- **solarized_dark** - Easy on the eyes
- **dracula** - Vibrant purple and pink
- **nord** - Arctic blues
- **tokyo_night** - Tokyo city lights
- **matrix** - Green phosphor only
- **high_contrast** - Maximum readability
- **minimalist** - Grayscale simplicity
- **retro_amber** - Classic amber CRT

## 🛠️ Configuration Management CLI

### View available themes
```bash
npm run config:themes
```

### Edit your config
```bash
npm run config:edit        # Edit user config (~/.scrapbook/config.yaml)
npm run config:edit local  # Edit project config (./.scrapbook.yaml)
```

### Validate configuration
```bash
npm run config:validate           # Validate current config
npm run config:validate file.yaml # Validate specific file
```

### Get configuration info
```bash
npm run config:info  # Shows sources, theme, and validation status
```

### Watch for config changes
```bash
npm run config:watch  # Hot-reload on config changes
```

### Get/Set specific values
```bash
node config-cli.js get theme.colors.palette
node config-cli.js set theme_preset dracula
node config-cli.js set display.column_widths.date 25
```

### List all valid keys
```bash
node config-cli.js keys  # Shows all configurable options
```

### Reset configuration
```bash
node config-cli.js reset       # Reset user config
node config-cli.js reset local # Reset project config
```

## 📁 Configuration Hierarchy

1. **Default**: `config.yaml` (built-in defaults)
2. **Environment**: `config.development.yaml` or `config.production.yaml`
3. **User**: `~/.scrapbook/config.yaml` (your preferences)
4. **Project**: `./.scrapbook.yaml` (project overrides)
5. **CLI flags**: `--theme <name>` (session overrides)
6. **Environment variables**: `SCRAPBOOK_THEME=matrix` (runtime overrides)

Each level overrides the previous using deep merge.

## 🔄 Environment Variable Overrides

Any config value can be overridden via environment variables:

```bash
# Override theme
export SCRAPBOOK_THEME=cyberpunk

# Override specific color
export SCRAPBOOK_THEME_COLORS_PALETTE_0="#FF00FF"

# Override animation speed
export SCRAPBOOK_ANIMATIONS_SUMMARY_DURATION=5

# Override column widths
export SCRAPBOOK_DISPLAY_COLUMN_WIDTHS_DATE=25
```

Path format: `SCRAPBOOK_<PATH_WITH_UNDERSCORES>=value`

## ✅ Configuration Validation

The config system validates all settings using Joi schemas:

- Color values must be valid hex codes
- Numeric values must be within valid ranges
- Required fields are enforced
- Unknown fields are rejected

Validation runs automatically and shows warnings for issues.

## 🔥 Hot Reload

Enable config hot-reloading during development:

```javascript
// In your code
import { watchConfig } from './config.js';

const unwatch = watchConfig((newConfig) => {
  console.log('Config reloaded!', newConfig);
  // Update your app with new config
});

// Later, to stop watching
unwatch();
```

Or use the CLI:
```bash
npm run config:watch
```

## 🎯 Custom Themes

Create your own theme in `~/.scrapbook/config.yaml`:

```yaml
theme:
  colors:
    palette:
      - "#E91E63"  # Pink
      - "#9C27B0"  # Purple
      - "#673AB7"  # Deep Purple
      - "#3F51B5"  # Indigo
      - "#2196F3"  # Blue
    borders:
      default: "#9C27B0"
      focus: "#E91E63"
      selected: "#673AB7"
    text:
      default: "#FFFFFF"
      highlight: "#E91E63"

# Or use animation settings
animations:
  summary:
    duration: 5
    chunk_size: 15

# Or customize symbols
symbols:
  ui:
    bullet: "▸"
    arrow: "➤"
    dot: "◉"
```

## 🗄️ Database & Supabase Configuration

### Connection Settings
```yaml
database:
  # Credentials from environment variables (recommended)
  # SUPABASE_URL and SUPABASE_KEY

  table: scraps               # Table to query
  order_by: created_at        # Sort field
  order_direction: desc       # asc or desc
  default_limit: 1000         # Max records to fetch
  default_select: "*"         # Fields to select
```

### Search Configuration
```yaml
database:
  search_columns:
    - content
    - tags
    - summary
    - title
    - author                  # Add custom columns

  search_type: websearch      # Options: websearch, plain, phrase
  search_config: english      # Language config for search
```

### Multiple Supabase Projects
```yaml
# Use NODE_ENV to switch between databases

# config.development.yaml
database:
  table: scraps_dev
  default_limit: 100

# config.staging.yaml
database:
  table: scraps_staging
  default_limit: 500

# config.production.yaml
database:
  table: scraps
  default_limit: 1000
```

### Environment Variable Overrides
```bash
# Override any database setting via env vars
export SCRAPBOOK_DATABASE_TABLE=my_custom_table
export SCRAPBOOK_DATABASE_ORDER_BY=updated_at
export SCRAPBOOK_DATABASE_DEFAULT_LIMIT=500
export SCRAPBOOK_DATABASE_SEARCH_TYPE=phrase
```

## 📊 Performance Tuning

### Disable animations for speed
```yaml
animations:
  summary:
    enabled: false
  force_layout:
    auto_start: false
```

### Optimize Database Queries
```yaml
database:
  default_limit: 200          # Fetch fewer records
  default_select: "id,title,content,created_at"  # Only needed fields
```

### Adjust physics for smoother force layout
```yaml
physics:
  damping: 0.95      # More damping = smoother
  repulsion_force: 10 # Higher = more spread out
  tick_interval: 50   # Lower = smoother animation
```

### Optimize column widths for your terminal
```yaml
display:
  column_widths:
    date: 12       # Narrower date
    source: 10     # Narrower source
    content: 78    # More room for content
```

## 🔐 Security

### Supabase Credentials
**NEVER** store credentials in config files. Always use environment variables:

```bash
# .env file (git ignored)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
```

The config system checks in this order:
1. Config file values (if explicitly set)
2. Environment variables (recommended)

```yaml
# config.yaml - DON'T do this
database:
  supabase_url: "https://..."  # ❌ BAD - exposed in config
  supabase_key: "sk-..."        # ❌ BAD - exposed in config

# config.yaml - DO this instead
database:
  # Credentials come from SUPABASE_URL and SUPABASE_KEY env vars
  table: scraps
  order_by: created_at
```

### General Security
- User configs are stored in `~/.scrapbook/config.yaml`
- Sensitive data should use environment variables, not config files
- Config files are validated to prevent injection attacks
- Invalid YAML is rejected with clear error messages

## 📦 Distribution

When distributing your app:

1. Include `config.yaml` with defaults
2. Include `config.example.yaml` with examples
3. Document environment-specific configs
4. Use `NODE_ENV` to load appropriate configs:
   - `config.development.yaml`
   - `config.production.yaml`
   - `config.test.yaml`

## 🐛 Troubleshooting

### Config not loading?
```bash
npm run config:info  # Check which configs are loaded
npm run config:validate  # Check for validation errors
```

### Theme not applying?
```bash
# Check theme is available
npm run config:themes

# Check current theme
node config-cli.js get theme_preset

# Force reload
SCRAPBOOK_THEME=cyberpunk node index.mjs
```

### Hot reload not working?
- Ensure file exists before watching
- Check file permissions
- Use absolute paths in watchers

## 🚀 Advanced Usage

### Programmatic theme switching
```javascript
import { loadConfig } from './config.js';

// Switch theme at runtime
const config = loadConfig({ theme: 'cyberpunk' });
```

### Custom validation rules
```javascript
import { validateConfig } from './config/validator.js';

const customConfig = { /* ... */ };
const result = validateConfig(customConfig);

if (!result.valid) {
  console.error('Config errors:', result.errors);
}
```

### Migration from old configs
```javascript
import { saveUserConfig } from './config.js';

// Migrate old config format
const oldConfig = JSON.parse(fs.readFileSync('old-config.json'));
const newConfig = migrateConfig(oldConfig);
await saveUserConfig(newConfig);
```