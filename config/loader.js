import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { validateConfig } from "./validator.js";
import { loadTheme } from "../themes.js";
import chokidar from "chokidar";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config cache and hot reload support
let configCache = null;
let configWatchers = [];
let configChangeCallbacks = [];

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}

/**
 * Load theme presets
 */
function loadThemes() {
  const themesPath = path.join(__dirname, "themes.yaml");
  try {
    if (fs.existsSync(themesPath)) {
      const themesData = yaml.load(fs.readFileSync(themesPath, "utf8"));
      return themesData.themes || {};
    }
  } catch (error) {
    console.error("Error loading themes:", error.message);
  }
  return {};
}

/**
 * Apply a theme preset to config
 */
function applyThemePreset(config, themeName) {
  const themes = loadThemes();

  if (themes[themeName]) {
    const theme = themes[themeName];
    // Remove theme metadata before merging
    delete theme.name;
    delete theme.description;

    return deepMerge(config, theme);
  }

  console.warn(`Theme '${themeName}' not found`);
  return config;
}

/**
 * Load configuration from all sources
 */
export function loadConfig(options = {}) {
  const { validate = true, silent = false, theme = null, reload = false } = options;

  // Return cache if available and not reloading
  if (configCache && !reload) {
    return configCache;
  }

  let config = {};
  const configSources = [];

  try {
    // 1. Load default config
    const defaultConfigPath = path.join(path.dirname(__dirname), "config.yaml");
    if (fs.existsSync(defaultConfigPath)) {
      const defaultConfig = yaml.load(fs.readFileSync(defaultConfigPath, "utf8"));
      config = deepMerge(config, defaultConfig);
      configSources.push({ type: "default", path: defaultConfigPath });
    }

    // 2. Check for environment-specific config
    const env = process.env.NODE_ENV || "development";
    const envConfigPath = path.join(path.dirname(__dirname), `config.${env}.yaml`);
    if (fs.existsSync(envConfigPath)) {
      const envConfig = yaml.load(fs.readFileSync(envConfigPath, "utf8"));
      config = deepMerge(config, envConfig);
      configSources.push({ type: "environment", path: envConfigPath });
      if (!silent) console.log(`Loaded ${env} config from ${envConfigPath}`);
    }

    // 3. User config
    const userConfigPath = path.join(os.homedir(), ".scrapbook", "config.yaml");
    if (fs.existsSync(userConfigPath)) {
      const userConfig = yaml.load(fs.readFileSync(userConfigPath, "utf8"));
      config = deepMerge(config, userConfig);
      configSources.push({ type: "user", path: userConfigPath });
      if (!silent) console.log(`Loaded user config from ${userConfigPath}`);
    }

    // 4. Local project config
    const localConfigPath = path.join(process.cwd(), ".scrapbook.yaml");
    if (fs.existsSync(localConfigPath)) {
      const localConfig = yaml.load(fs.readFileSync(localConfigPath, "utf8"));
      config = deepMerge(config, localConfig);
      configSources.push({ type: "local", path: localConfigPath });
      if (!silent) console.log(`Loaded local config from ${localConfigPath}`);
    }

    // 5. Apply theme preset if specified
    const themeName = theme || config.theme_preset || process.env.SCRAPBOOK_THEME;
    if (themeName) {
      config = applyThemePreset(config, themeName);
      if (!silent) console.log(`Applied theme: ${themeName}`);
    }

    // 6. Environment variable overrides
    const envOverrides = getEnvOverrides();
    if (Object.keys(envOverrides).length > 0) {
      config = deepMerge(config, envOverrides);
      if (!silent)
        {console.log(`Applied ${Object.keys(envOverrides).length} environment variable overrides`);}
    }

    // Validate config if requested
    if (validate) {
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.error("Configuration validation errors:");
        validation.errors.forEach((error) => {
          console.error(`  - ${error.path}: ${error.message}`);
        });

        if (!silent) {
          console.warn("Using configuration despite validation errors");
        }
      }
    }

    // Cache the config
    configCache = config;

    // Store config sources for debugging
    config._sources = configSources;
  } catch (error) {
    console.error("Error loading config:", error.message);
    config = getDefaultConfig();
  }

  return config;
}

/**
 * Get environment variable overrides
 * Supports: SCRAPBOOK_THEME_COLORS_PALETTE_0="#FF0000"
 */
function getEnvOverrides() {
  const overrides = {};
  const prefix = "SCRAPBOOK_";

  Object.keys(process.env).forEach((key) => {
    if (key.startsWith(prefix)) {
      const configPath = key.substring(prefix.length).toLowerCase().replace(/_/g, ".");

      const value = process.env[key];
      setNestedValue(overrides, configPath, parseEnvValue(value));
    }
  });

  return overrides;
}

/**
 * Parse environment variable value
 */
function parseEnvValue(value) {
  // Try to parse as JSON first
  try {
    return JSON.parse(value);
  } catch {
    // Check for boolean
    if (value === "true") return true;
    if (value === "false") return false;

    // Check for number
    if (!isNaN(value) && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }

    // Return as string
    return value;
  }
}

/**
 * Set a nested value in an object
 */
function setNestedValue(obj, path, value) {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      // Check if next part is a number (array index)
      const nextPart = parts[i + 1];
      current[part] = !isNaN(nextPart) ? [] : {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Get default configuration
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
        default: "📝",
      },
    },
    theme: {
      colors: {
        palette: [
          "#00FF00",
          "#FF0080",
          "#0080FF",
          "#FF8000",
          "#8000FF",
          "#00FF80",
          "#FF4000",
          "#80FF00",
          "#4000FF",
          "#FF0040",
        ],
      },
    },
    display: {
      view_headers: ["created_at", "source", "content", "tags", "summary"],
      all_headers: [
        "scrap_id",
        "created_at",
        "updated_at",
        "source",
        "content",
        "url",
        "title",
        "tags",
        "summary",
        "relationships",
        "location",
        "financial_analysis",
        "metadata",
      ],
    },
  };
}

/**
 * Watch config files for changes
 */
export function watchConfig(callback) {
  const paths = [
    path.join(path.dirname(__dirname), "config.yaml"),
    path.join(os.homedir(), ".scrapbook", "config.yaml"),
    path.join(process.cwd(), ".scrapbook.yaml"),
  ];

  // Clear existing watchers
  configWatchers.forEach((watcher) => watcher.close());
  configWatchers = [];

  paths.forEach((configPath) => {
    if (fs.existsSync(configPath)) {
      const watcher = chokidar.watch(configPath, {
        persistent: true,
        ignoreInitial: true,
      });

      watcher.on("change", () => {
        console.log(`Config changed: ${configPath}`);
        configCache = null; // Clear cache
        const newConfig = loadConfig({ reload: true });

        // Call all registered callbacks
        configChangeCallbacks.forEach((cb) => cb(newConfig));

        if (callback) callback(newConfig);
      });

      configWatchers.push(watcher);
    }
  });

  // Register the callback
  if (callback) {
    configChangeCallbacks.push(callback);
  }

  return () => {
    // Return cleanup function
    configWatchers.forEach((watcher) => watcher.close());
    configWatchers = [];
    configChangeCallbacks = configChangeCallbacks.filter((cb) => cb !== callback);
  };
}

/**
 * List available themes
 */
export function listThemes() {
  const themes = loadThemes();
  return Object.entries(themes).map(([key, theme]) => ({
    id: key,
    name: theme.name || key,
    description: theme.description || "No description",
  }));
}

/**
 * Get config info
 */
export function getConfigInfo() {
  const config = loadConfig();
  return {
    sources: config._sources || [],
    theme: config.theme_preset || "default",
    validationErrors: validateConfig(config).errors || [],
  };
}

/**
 * Export specific config sections for backward compatibility
 */
const config = loadConfig({ silent: true });

export default config;
export const SCRAP_TYPE_SYMBOLS = config.symbols?.types || getDefaultConfig().symbols.types;
export const COLOR_PALETTE =
  config.theme?.colors?.palette || getDefaultConfig().theme.colors.palette;
export const VIEW_HEADERS = config.display?.view_headers || getDefaultConfig().display.view_headers;
export const ALL_HEADERS = config.display?.all_headers || getDefaultConfig().display.all_headers;
