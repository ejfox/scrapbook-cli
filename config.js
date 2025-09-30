import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object to merge
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

/**
 * Check if value is an object
 * @param {*} item - Item to check
 * @returns {boolean}
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Load configuration from YAML files
 * @returns {Object} Merged configuration object
 */
function loadConfig() {
  let config = {};

  try {
    // Load default config from project directory
    const defaultConfigPath = path.join(__dirname, 'config.yaml');
    if (fs.existsSync(defaultConfigPath)) {
      const defaultConfig = yaml.load(fs.readFileSync(defaultConfigPath, 'utf8'));
      config = deepMerge(config, defaultConfig);
    }

    // Check for user config in ~/.scrapbook/config.yaml
    const userConfigPath = path.join(os.homedir(), '.scrapbook', 'config.yaml');
    if (fs.existsSync(userConfigPath)) {
      const userConfig = yaml.load(fs.readFileSync(userConfigPath, 'utf8'));
      config = deepMerge(config, userConfig);
      console.log(`Loaded user config from ${userConfigPath}`);
    }

    // Check for local project config override
    const localConfigPath = path.join(process.cwd(), '.scrapbook.yaml');
    if (fs.existsSync(localConfigPath)) {
      const localConfig = yaml.load(fs.readFileSync(localConfigPath, 'utf8'));
      config = deepMerge(config, localConfig);
      console.log(`Loaded local config from ${localConfigPath}`);
    }

  } catch (error) {
    console.error('Error loading config:', error.message);
    // Return default values if config loading fails
    config = getDefaultConfig();
  }

  return config;
}

/**
 * Get default configuration (fallback)
 * @returns {Object} Default configuration
 */
function getDefaultConfig() {
  return {
    symbols: {
      types: {
        article: "📄",
        bookmark: "🔖",
        code: "💻",
        image: "🖼️",
        video: "🎥",
        audio: "🎵",
        document: "📋",
        default: "📝"
      }
    },
    theme: {
      colors: {
        palette: [
          "#00FF00", "#FF0080", "#0080FF", "#FF8000", "#8000FF",
          "#00FF80", "#FF4000", "#80FF00", "#4000FF", "#FF0040"
        ]
      }
    },
    display: {
      view_headers: ["created_at", "source", "content", "tags", "summary"],
      all_headers: [
        "scrap_id", "created_at", "updated_at", "source", "content",
        "url", "title", "tags", "summary", "relationships", "location",
        "financial_analysis", "metadata"
      ]
    }
  };
}

// Load config once when module is imported
const config = loadConfig();

// Export the loaded config
export default config;

// Export specific config sections for backward compatibility
export const SCRAP_TYPE_SYMBOLS = config.symbols?.types || getDefaultConfig().symbols.types;
export const COLOR_PALETTE = config.theme?.colors?.palette || getDefaultConfig().theme.colors.palette;
export const VIEW_HEADERS = config.display?.view_headers || getDefaultConfig().display.view_headers;
export const ALL_HEADERS = config.display?.all_headers || getDefaultConfig().display.all_headers;

// Export utility function to reload config
export function reloadConfig() {
  return loadConfig();
}

// Export function to save user config
export async function saveUserConfig(userConfig) {
  const userConfigDir = path.join(os.homedir(), '.scrapbook');
  const userConfigPath = path.join(userConfigDir, 'config.yaml');

  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(userConfigDir)) {
      fs.mkdirSync(userConfigDir, { recursive: true });
    }

    // Write config
    fs.writeFileSync(userConfigPath, yaml.dump(userConfig, {
      indent: 2,
      lineWidth: 80,
      noRefs: true,
      sortKeys: false
    }));

    console.log(`Saved user config to ${userConfigPath}`);
    return true;
  } catch (error) {
    console.error('Error saving user config:', error.message);
    return false;
  }
}