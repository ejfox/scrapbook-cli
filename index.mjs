#!/usr/bin/env node

import { Command } from "commander";
import { loadBookmarks, displayScrapJson } from "./data.js";
import { loadConfig } from "./config.js";
import blessed from "blessed";
import { createUI, setupKeyboardShortcuts, displayHelp } from "./ui.js";
import { createMapView } from "./ui/map-view.js";

async function showLoadingScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "scrapbook-cli",
  });

  // Functional status log - no fancy animations
  const loadingBox = blessed.box({
    parent: screen,
    top: 1,
    left: 1,
    width: "100%-2",
    height: "100%-2",
    tags: true,
    border: {
      type: "line",
    },
    style: {
      border: {
        fg: "#595959", // Vulpes gray
      },
    },
  });

  const startTime = Date.now();
  const logLines = [];

  function addLog(message, type = "info") {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
    const prefix = type === "error" ? "{red-fg}✗{/red-fg}" :
                   type === "success" ? "{#ff1a90-fg}✓{/}" :
                   "{#595959-fg}◆{/}";
    const line = `{#595959-fg}[${elapsed}s]{/} ${prefix} ${message}`;
    logLines.push(line);
    loadingBox.setContent(logLines.join("\n"));
    screen.render();
  }

  addLog("Initializing scrapbook-cli", "info");
  addLog("Loading configuration", "info");

  // Return log function so we can update from outside
  return {
    screen,
    addLog,
    finish: () => {
      addLog("Initialization complete", "success");
      screen.render();
    }
  };
}

// Main function
async function main(options) {
  const { screen: loadingScreen, addLog, finish } = await showLoadingScreen();

  try {
    // Load config with theme if specified
    const configStart = Date.now();
    if (options.theme) {
      loadConfig({ theme: options.theme, silent: false });
      addLog(`Applied theme: ${options.theme}`, "success");
    } else {
      loadConfig({ silent: true });
    }
    const configTime = Date.now() - configStart;
    addLog(`Configuration loaded (${configTime}ms)`, "success");

    // Connect to database and load bookmarks
    addLog("Connecting to Supabase...", "info");
    const loadStart = Date.now();
    const bookmarks = await loadBookmarks();
    const loadTime = Date.now() - loadStart;

    addLog(`Connected to database`, "success");
    addLog(`Loaded ${bookmarks.length} scraps (${loadTime}ms)`, "success");

    // Calculate some stats
    const withTags = bookmarks.filter(b => b.tags && b.tags.length > 0).length;
    const withSummary = bookmarks.filter(b => b.summary).length;
    const withMetaSummary = bookmarks.filter(b => b.meta_summary).length;
    const withLocation = bookmarks.filter(b => b.location && b.location !== "Unknown").length;

    addLog(`Stats: ${withTags} tagged, ${withSummary} summarized, ${withMetaSummary} meta, ${withLocation} located`, "info");

    if (options.map) {
      addLog("Initializing map view...", "info");
      finish();
      setTimeout(() => {
        loadingScreen.destroy();
        createMapView(bookmarks);
      }, 500);
      return;
    }

    addLog("Building UI components...", "info");
    addLog(`Ready`, "success");
    finish();

    // Brief pause to show completion, then destroy loading and create main UI
    setTimeout(() => {
      loadingScreen.destroy();

      // Now create main UI after loading screen is destroyed
      const {
        screen,
        table,
        summaryBox,
        alertBox,
        miniMap,
        searchQueryBox,
        fullScreenSummaryBox,
        updateDisplay,
      } = createUI(bookmarks);

      setupKeyboardShortcuts(
        screen,
        table,
        summaryBox,
        alertBox,
        miniMap,
        searchQueryBox,
        fullScreenSummaryBox,
        bookmarks,
        updateDisplay
      );

      table.focus();
      screen.render();
    }, 400);
  } catch (error) {
    addLog(`Error: ${error.message}`, "error");
    addLog("Connection failed - press any key to exit", "error");

    loadingScreen.key(["escape", "q", "C-c", "enter", "space"], () => {
      process.exit(1);
    });
  }
}

// Set up command-line interface
const program = new Command();
program
  .name("scrapbook-cli")
  .description("CLI for managing and viewing scrapbook entries")
  .version("1.0.0")
  .option("-m, --map", "Display a map of all bookmarks")
  .option("-t, --theme <theme>", "Use a specific theme preset");

program
  .command("list")
  .description("List all bookmarks")
  .action((cmd) => main(cmd));

program
  .command("json <scrap_id>")
  .description("Display JSON for a specific scrap")
  .action((scrap_id) => displayScrapJson(scrap_id));

program.option("-h, --help", "Display help information").action((options) => {
  if (options.help) {
    displayHelp();
  } else {
    main(options);
  }
});

program.parse(process.argv);
