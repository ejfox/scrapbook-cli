import Joi from 'joi';

/**
 * Configuration schema for validation
 */
const configSchema = Joi.object({
  // Theme preset selection
  theme_preset: Joi.string().optional(),

  // Theme configuration
  theme: Joi.object({
    colors: Joi.object({
      palette: Joi.array().items(Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/)).min(1),
      borders: Joi.object({
        default: Joi.string(),
        focus: Joi.string(),
        selected: Joi.string(),
        alert: Joi.string(),
        info: Joi.string()
      }),
      text: Joi.object({
        default: Joi.string(),
        highlight: Joi.string(),
        error: Joi.string(),
        dim: Joi.string()
      })
    })
  }),

  // Symbols configuration
  symbols: Joi.object({
    types: Joi.object().pattern(Joi.string(), Joi.string()),
    ui: Joi.object().pattern(Joi.string(), Joi.string())
  }),

  // Display configuration
  display: Joi.object({
    view_headers: Joi.array().items(Joi.string()),
    all_headers: Joi.array().items(Joi.string()),
    hidden_headers: Joi.array().items(Joi.string()),
    column_widths: Joi.object({
      date: Joi.number().min(5).max(50),
      source: Joi.number().min(5).max(50),
      content: Joi.number().min(20).max(90)
    }),
    min_column_widths: Joi.object({
      date: Joi.number().min(5),
      source: Joi.number().min(5),
      content: Joi.number().min(10)
    })
  }),

  // Animation settings
  animations: Joi.object({
    summary: Joi.object({
      enabled: Joi.boolean(),
      duration: Joi.number().min(0).max(1000),
      chunk_size: Joi.number().min(1).max(100)
    }),
    force_layout: Joi.object({
      enabled: Joi.boolean(),
      tick_interval: Joi.number().min(10).max(1000),
      auto_start: Joi.boolean(),
      auto_start_delay: Joi.number().min(0).max(10000)
    })
  }),

  // Physics configuration
  physics: Joi.object({
    center_force: Joi.number().min(0).max(1),
    repulsion_force: Joi.number().min(0).max(100),
    link_distance: Joi.number().min(1).max(100),
    link_force: Joi.number().min(0).max(1),
    damping: Joi.number().min(0).max(1),
    bounds_padding: Joi.number().min(0).max(50)
  }),

  // Keyboard shortcuts
  shortcuts: Joi.object().pattern(
    Joi.string(),
    Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    )
  ),

  // Search configuration
  search: Joi.object({
    fields: Joi.array().items(Joi.string()),
    type: Joi.string().valid('websearch', 'plain', 'regex'),
    config: Joi.string()
  }),

  // Layout configuration
  layout: Joi.object({
    grid: Joi.object({
      rows: Joi.number().min(6).max(24),
      cols: Joi.number().min(6).max(24)
    }),
    panels: Joi.object().pattern(
      Joi.string(),
      Joi.object({
        row: Joi.number().min(0),
        col: Joi.number().min(0),
        height: Joi.number().min(1),
        width: Joi.number().min(1)
      })
    )
  }),

  // External commands
  commands: Joi.object({
    open: Joi.object({
      darwin: Joi.string(),
      win32: Joi.string(),
      linux: Joi.string()
    }),
    clipboard: Joi.object({
      darwin: Joi.string(),
      win32: Joi.string(),
      linux: Joi.string(),
      linux_fallback: Joi.string()
    })
  }),

  // Database configuration
  database: Joi.object({
    table: Joi.string(),
    order_by: Joi.string(),
    order_direction: Joi.string().valid('asc', 'desc')
  }),

  // URL templates
  urls: Joi.object({
    public_base: Joi.string().uri()
  }),

  // Miscellaneous
  misc: Joi.object({
    lines_per_page: Joi.number().min(5).max(100),
    summary_preview_length: Joi.number().min(10).max(500),
    content_preview_length: Joi.number().min(10).max(500),
    relationship_preview_count: Joi.number().min(1).max(50),
    location_preview_length: Joi.number().min(10).max(200),
    alert_timeout: Joi.number().min(100).max(30000)
  })
}).unknown(false);

/**
 * Validate a configuration object
 * @param {Object} config - Configuration to validate
 * @returns {Object} { valid: boolean, errors: Array|null, value: Object }
 */
export function validateConfig(config) {
  const result = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: false
  });

  if (result.error) {
    return {
      valid: false,
      errors: result.error.details.map(detail => ({
        path: detail.path.join('.'),
        message: detail.message
      })),
      value: null
    };
  }

  return {
    valid: true,
    errors: null,
    value: result.value
  };
}

/**
 * Get a list of all valid configuration keys
 * @returns {Array} Array of valid configuration paths
 */
export function getValidConfigKeys() {
  const keys = [];

  function extractKeys(schema, prefix = '') {
    if (schema._ids && schema._ids._byKey) {
      for (const [key, value] of schema._ids._byKey) {
        const path = prefix ? `${prefix}.${key}` : key;
        keys.push(path);

        // Recursively extract nested keys
        if (value.schema && value.schema._ids) {
          extractKeys(value.schema, path);
        }
      }
    }
  }

  extractKeys(configSchema);
  return keys;
}

/**
 * Check if a config value is valid for a given path
 * @param {string} path - Configuration path (e.g., 'theme.colors.palette')
 * @param {*} value - Value to validate
 * @returns {boolean}
 */
export function isValidConfigValue(path, value) {
  const pathParts = path.split('.');
  let schema = configSchema;

  // Navigate to the correct schema part
  for (const part of pathParts) {
    if (schema._ids && schema._ids._byKey.has(part)) {
      schema = schema._ids._byKey.get(part).schema;
    } else {
      return false; // Invalid path
    }
  }

  // Validate the value against the schema
  const result = schema.validate(value);
  return !result.error;
}