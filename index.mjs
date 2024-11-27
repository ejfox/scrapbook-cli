#!/usr/bin/env node

import { Command } from "commander";
import { loadBookmarks, displayScrapJson } from "./data.js";
import blessed from "blessed";
import {
  createUI,
  setupKeyboardShortcuts,
  createMapView,
  displayHelp,
} from "./ui.js";

async function showLoadingScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "Loading Scrapbook CLI",
  });

  const loadingBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "50%",
    height: "50%",
    content: "INITIALIZING SCRAPBOOK\nPLEASE WAIT",
    border: "line",
    style: {
      border: { fg: "green" },
    },
  });

  let dots = "";
  const loadingInterval = setInterval(() => {
    dots = dots.length >= 3 ? "" : dots + ".";
    loadingBox.setContent(`INITIALIZING SCRAPBOOK\nPLEASE WAIT${dots}`);
    screen.render();
  }, 500);

  screen.render();
  return { screen, loadingInterval };
}

// Main function
async function main(options) {
  const { screen: loadingScreen, loadingInterval } = await showLoadingScreen();

  try {
    const bookmarks = await loadBookmarks();
    // Clean up loading screen
    clearInterval(loadingInterval);
    loadingScreen.destroy();

    if (options.map) {
      createMapView(bookmarks);
      return;
    }

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
  } catch (error) {
    // If there's an error, show it in the loading screen
    clearInterval(loadingInterval);
    loadingScreen.destroy();

    const errorScreen = blessed.screen({
      smartCSR: true,
      title: "Error",
    });

    const errorBox = blessed.box({
      parent: errorScreen,
      top: "center",
      left: "center",
      width: "80%",
      height: "50%",
      content: `CONNECTION ERROR\n\nCould not load bookmarks.\nPlease check your connection and try again.\n\nError: ${error.message}\n\nPress any key to exit`,
      border: "line",
      style: {
        border: { fg: "red" },
      },
    });

    errorScreen.key(["escape", "q", "C-c", "enter", "space"], () => {
      process.exit(1);
    });

    errorScreen.render();
  }
}

// Set up command-line interface
const program = new Command();
program
  .name("scrapbook-cli")
  .description("CLI for managing and viewing scrapbook entries")
  .version("1.0.0")
  .option("-m, --map", "Display a map of all bookmarks");

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
