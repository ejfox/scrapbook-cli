// Re-export everything from the new config loader
// This file provides backward compatibility
import {
  loadConfig,
  watchConfig,
  listThemes,
  getConfigInfo,
  SCRAP_TYPE_SYMBOLS,
  COLOR_PALETTE,
  VIEW_HEADERS,
  ALL_HEADERS,
} from "./config/loader.js";

export {
  loadConfig,
  watchConfig,
  listThemes,
  getConfigInfo,
  SCRAP_TYPE_SYMBOLS,
  COLOR_PALETTE,
  VIEW_HEADERS,
  ALL_HEADERS,
};

import config from "./config/loader.js";
export default config;

// Legacy function for backward compatibility
export function reloadConfig() {
  return loadConfig({ reload: true });
}

// Legacy function for backward compatibility
export async function saveUserConfig(userConfig) {
  const yaml = await import("js-yaml");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  const userConfigDir = path.join(os.homedir(), ".scrapbook");
  const userConfigPath = path.join(userConfigDir, "config.yaml");

  try {
    if (!fs.existsSync(userConfigDir)) {
      fs.mkdirSync(userConfigDir, { recursive: true });
    }

    fs.writeFileSync(
      userConfigPath,
      yaml.dump(userConfig, {
        indent: 2,
        lineWidth: 80,
        noRefs: true,
        sortKeys: false,
      })
    );

    console.log(`Saved user config to ${userConfigPath}`);
    return true;
  } catch (error) {
    console.error("Error saving user config:", error.message);
    return false;
  }
}
