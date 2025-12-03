#!/usr/bin/env node

import { Command } from "commander";
import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import chalk from "chalk";
import { loadConfig, listThemes, getConfigInfo, watchConfig } from "./config/loader.js";
import { validateConfig, getValidConfigKeys } from "./config/validator.js";
import { spawn } from "child_process";

const program = new Command();

program
  .name("scrapbook-config")
  .description("Scrapbook CLI Configuration Management")
  .version("1.0.0");

// List themes command
program
  .command("themes")
  .description("List available themes")
  .action(() => {
    const themes = listThemes();
    console.log(chalk.bold("\n📎 Available Themes:\n"));

    themes.forEach((theme) => {
      console.log(chalk.green(`  ${theme.id}`) + chalk.gray(` - ${theme.name}`));
      console.log(chalk.dim(`    ${theme.description}`));
    });

    console.log("\nUse: scrapbook-cli --theme <theme-name>");
    console.log("Or set in config: theme_preset: <theme-name>\n");
  });

// Show config info
program
  .command("info")
  .description("Show configuration sources and status")
  .action(() => {
    const info = getConfigInfo();

    console.log(chalk.bold("\n📋 Configuration Info:\n"));

    console.log(chalk.yellow("Sources:"));
    info.sources.forEach((source, i) => {
      const symbol = i === info.sources.length - 1 ? "└─" : "├─";
      console.log(`  ${symbol} ${chalk.cyan(source.type)}: ${source.path}`);
    });

    console.log(chalk.yellow("\nActive Theme:"), info.theme);

    if (info.validationErrors.length > 0) {
      console.log(chalk.red("\nValidation Errors:"));
      info.validationErrors.forEach((error) => {
        console.log(`  ⚠️  ${error.path}: ${error.message}`);
      });
    } else {
      console.log(chalk.green("\n✅ Configuration is valid"));
    }
  });

// Validate config
program
  .command("validate [file]")
  .description("Validate a configuration file")
  .action((file) => {
    let config;

    if (file) {
      // Validate specific file
      if (!fs.existsSync(file)) {
        console.error(chalk.red(`File not found: ${file}`));
        process.exit(1);
      }

      try {
        config = yaml.load(fs.readFileSync(file, "utf8"));
        console.log(chalk.gray(`Validating: ${file}`));
      } catch (error) {
        console.error(chalk.red("Invalid YAML:", error.message));
        process.exit(1);
      }
    } else {
      // Validate current config
      config = loadConfig({ validate: false });
      console.log(chalk.gray("Validating current configuration"));
    }

    const validation = validateConfig(config);

    if (validation.valid) {
      console.log(chalk.green("\n✅ Configuration is valid!\n"));
    } else {
      console.log(chalk.red("\n❌ Configuration has errors:\n"));
      validation.errors.forEach((error) => {
        console.log(chalk.yellow(`  ${error.path}:`), error.message);
      });
      console.log();
      process.exit(1);
    }
  });

// Edit config
program
  .command("edit [type]")
  .description("Edit configuration (user/local/default)")
  .action((type = "user") => {
    let configPath;

    switch (type) {
      case "user":
        configPath = path.join(os.homedir(), ".scrapbook", "config.yaml");
        break;
      case "local":
        configPath = path.join(process.cwd(), ".scrapbook.yaml");
        break;
      case "default":
        configPath = path.join(process.cwd(), "config.yaml");
        break;
      default:
        console.error(chalk.red(`Unknown config type: ${type}`));
        console.log("Use: user, local, or default");
        process.exit(1);
    }

    // Create directory if needed
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file if it doesn't exist
    if (!fs.existsSync(configPath)) {
      const template = `# Scrapbook CLI Configuration
# Created: ${new Date().toISOString()}

# Uncomment and modify settings as needed

# theme_preset: cyberpunk

# theme:
#   colors:
#     palette:
#       - "#FF00FF"

# display:
#   column_widths:
#     date: 20
#     source: 15
#     content: 65
`;
      fs.writeFileSync(configPath, template);
      console.log(chalk.green(`Created: ${configPath}`));
    }

    // Open in editor
    const editor = process.env.EDITOR || "nano";
    console.log(chalk.gray(`Opening ${configPath} in ${editor}...`));

    const child = spawn(editor, [configPath], {
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        console.log(chalk.green("\n✅ Config saved"));

        // Validate the edited config
        try {
          const config = yaml.load(fs.readFileSync(configPath, "utf8"));
          const validation = validateConfig(config);

          if (!validation.valid) {
            console.log(chalk.yellow("\n⚠️  Configuration has issues:"));
            validation.errors.forEach((error) => {
              console.log(`  - ${error.path}: ${error.message}`);
            });
          }
        } catch (error) {
          console.error(chalk.red("Invalid YAML:", error.message));
        }
      }
    });
  });

// Get config value
program
  .command("get <path>")
  .description("Get a configuration value")
  .action((path) => {
    const config = loadConfig();
    const value = getNestedValue(config, path);

    if (value === undefined) {
      console.log(chalk.red(`Config path not found: ${path}`));
      process.exit(1);
    }

    if (typeof value === "object") {
      console.log(yaml.dump(value, { indent: 2 }));
    } else {
      console.log(value);
    }
  });

// Set config value
program
  .command("set <path> <value>")
  .description("Set a configuration value in user config")
  .action((path, value) => {
    const userConfigPath = path.join(os.homedir(), ".scrapbook", "config.yaml");
    const dir = path.dirname(userConfigPath);

    // Create directory if needed
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing config or create new
    let userConfig = {};
    if (fs.existsSync(userConfigPath)) {
      userConfig = yaml.load(fs.readFileSync(userConfigPath, "utf8")) || {};
    }

    // Parse value
    let parsedValue;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    // Set the value
    setNestedValue(userConfig, path, parsedValue);

    // Save config
    fs.writeFileSync(
      userConfigPath,
      yaml.dump(userConfig, {
        indent: 2,
        lineWidth: 80,
        noRefs: true,
        sortKeys: false,
      })
    );

    console.log(chalk.green(`✅ Set ${path} = ${value}`));
    console.log(chalk.gray(`Saved to: ${userConfigPath}`));
  });

// List valid keys
program
  .command("keys")
  .description("List all valid configuration keys")
  .action(() => {
    const keys = getValidConfigKeys();
    console.log(chalk.bold("\n🔑 Valid Configuration Keys:\n"));

    // Group keys by top-level category
    const grouped = {};
    keys.forEach((key) => {
      const category = key.split(".")[0];
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(key);
    });

    Object.entries(grouped).forEach(([category, categoryKeys]) => {
      console.log(chalk.yellow(`\n${category}:`));
      categoryKeys.forEach((key) => {
        const indent = "  ".repeat(key.split(".").length - 1);
        console.log(chalk.dim("  " + indent) + key.split(".").pop());
      });
    });
  });

// Watch config changes
program
  .command("watch")
  .description("Watch configuration files for changes")
  .action(() => {
    console.log(chalk.yellow("👁️  Watching configuration files...\n"));
    console.log(chalk.gray("Press Ctrl+C to stop\n"));

    watchConfig((config) => {
      console.log(chalk.green(`[${new Date().toLocaleTimeString()}] Config reloaded`));

      const validation = validateConfig(config);
      if (!validation.valid) {
        console.log(chalk.yellow("  ⚠️  Validation errors:"));
        validation.errors.forEach((error) => {
          console.log(`    - ${error.path}: ${error.message}`);
        });
      } else {
        console.log(chalk.green("  ✅ Configuration valid"));
      }
    });

    // Keep process alive
    process.stdin.resume();
  });

// Reset config
program
  .command("reset [type]")
  .description("Reset configuration to defaults")
  .action((type = "user") => {
    let configPath;

    switch (type) {
      case "user":
        configPath = path.join(os.homedir(), ".scrapbook", "config.yaml");
        break;
      case "local":
        configPath = path.join(process.cwd(), ".scrapbook.yaml");
        break;
      default:
        console.error(chalk.red(`Unknown config type: ${type}`));
        console.log("Use: user or local");
        process.exit(1);
    }

    if (fs.existsSync(configPath)) {
      // Backup existing config
      const backupPath = `${configPath}.backup.${Date.now()}`;
      fs.copyFileSync(configPath, backupPath);
      console.log(chalk.gray(`Backup created: ${backupPath}`));

      // Remove config
      fs.unlinkSync(configPath);
      console.log(chalk.green(`✅ Reset ${type} configuration`));
    } else {
      console.log(chalk.yellow(`No ${type} configuration found`));
    }
  });

// Helper functions
function getNestedValue(obj, path) {
  return path.split(".").reduce((current, part) => {
    return current ? current[part] : undefined;
  }, obj);
}

function setNestedValue(obj, path, value) {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

program.parse(process.argv);
