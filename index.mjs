#!/usr/bin/env node

import { Command } from "commander";
import blessed from "blessed";
import contrib from "blessed-contrib";
import * as d3 from "d3";
import chalk from "chalk";
import { format } from "date-fns";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Constants
const SCRAP_TYPE_SYMBOLS = {
  pinboard: "■",
  "mastodon-post": "▲",
  mastodon: "▲",
  arena: "●",
  github: "◆",
  "github-star": "◆",
  "github-pr": "◇",
  twitter: "○",
};

const COLOR_PALETTE = [
  "#00FF00", // Cyberpunk green
  "#00FFFF", // Cyberpunk blue
  "#FFFF00", // Cyberpunk yellow
  "#FFA500", // Cyberpunk orange
  "#808080", // Cyberpunk gray
];

const VIEW_HEADERS = ["created_at", "scrap_id", "source", "content"];
const ALL_HEADERS = [
  "id",
  "source",
  "content",
  "summary",
  "created_at",
  "tags",
  "relationships",
  "metadata",
  "scrap_id",
];

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Load bookmarks from Supabase
async function loadBookmarks() {
  const { data, error } = await supabase
    .from("scraps")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading bookmarks:", error);
    return [];
  }

  return data.map((bookmark) => ({
    ...bookmark,
    public_url: `https://ejfox.com/scrapbook/${
      bookmark.scrap_id || bookmark.id
    }`,
  }));
}

async function displayScrapJson(scrap_id) {
  try {
    const { data, error } = await supabase
      .from("scraps")
      .select("*")
      .eq("scrap_id", scrap_id)
      .single();

    if (error) throw error;

    if (data) {
      // delete the embedding data, it's too big
      delete data.embedding;
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`No scrap found with ID: ${scrap_id}`);
    }
  } catch (error) {
    console.error("Error fetching scrap:", error.message);
  }
}

// Create color scale for different scrap types
function createColorScale(bookmarks) {
  const scrapTypes = Array.from(new Set(bookmarks.map((b) => b.source)));
  return d3.scaleOrdinal(COLOR_PALETTE).domain(scrapTypes);
}

// Format table data for display
function formatTableData(bookmarks, colorScale) {
  return {
    headers: VIEW_HEADERS,
    data: bookmarks.map((bookmark) => {
      const row = VIEW_HEADERS.map((header) => {
        if (header === "created_at") {
          return format(new Date(bookmark[header]), "yyyy-MM-dd");
        } else if (header === "source") {
          const scrapTypeSymbol = SCRAP_TYPE_SYMBOLS[bookmark[header]] || "";
          return `${scrapTypeSymbol} ${bookmark[header] || ""}`;
        } else {
          return bookmark[header] || "";
        }
      });
      row.color = colorScale(bookmark.source);
      return row;
    }),
  };
}

// Create main screen
function createScreen() {
  return blessed.screen({
    smartCSR: true,
    title: "ejfox.com/scrapbook CLI",
    dockBorders: true,
    fullUnicode: true,
    autoPadding: true,
  });
}

// Create grid layout
function createGrid(screen) {
  return new contrib.grid({ rows: 12, cols: 12, screen: screen });
}

// Create main table for bookmarks
function createTable(grid) {
  return grid.set(0, 0, 12, 8, contrib.table, {
    keys: true,
    fg: "green",
    label: "Bookmarks",
    columnWidth: [8, 8, 8, 40],
    vi: true,
    style: {
      header: {
        fg: "cyan",
        bold: true,
        align: "left",
      },
      cell: {
        fg: "green",
        selected: {
          fg: "black",
          bg: "green",
        },
      },
    },
  });
}

// Create summary box
function createSummaryBox(grid) {
  return grid.set(0, 8, 6, 4, blessed.box, {
    label: "Summary - press 'z' to zoom",
    content: `Welcome to the scrapbook CLI!

Use the arrow keys to navigate through bookmarks.
Press 'space' to open a bookmark in the browser.
Press 's' to search for bookmarks.
Press 'z' to toggle full-screen summary view.
Press 'q' to quit the application.`,

    padding: 1,
    border: { type: "line" },
    style: {
      border: { fg: "green" },
      focus: { border: { fg: "yellow" } },
    },
  });
}

// Create alert box
function createAlertBox(grid) {
  return grid.set(10, 8, 2, 4, blessed.box, {
    content: "",
    padding: 0,
    border: { type: "line" },
    style: {
      focus: { border: { fg: "yellow" } },
    },
  });
}

// Create mini map for selected bookmark
function createMiniMap(grid) {
  return grid.set(6, 8, 4, 4, contrib.map, {
    label: "Location",
    style: {
      shapeColor: "cyan",
    },
  });
}

// Create search query box
function createSearchQueryBox(screen) {
  const box = blessed.box({
    parent: screen,
    top: "90%",
    left: "2%",
    height: 3,
    width: 20,
    content: "",
    padding: 1,
    style: {
      bg: "red",
      fg: "white",
    },
  });
  box.hide();
  return box;
}

// Create full screen summary box
function createFullScreenSummaryBox(screen) {
  const box = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "100%",
    height: "100%",
    border: null,
    padding: 0,
  });
  box.hide();
  return box;
}

let currentSummaryInterval;

// Stop current animation
function stopCurrentAnimation() {
  if (currentSummaryInterval) {
    clearInterval(currentSummaryInterval);
    currentSummaryInterval = null;
  }
}

// View summary of selected bookmark
function viewSummary(
  index,
  currentBookmarks,
  summaryBox,
  alertBox,
  miniMap,
  screen
) {
  stopCurrentAnimation();

  const bookmark = currentBookmarks[index];
  const summary = ALL_HEADERS.map((header) => {
    const value = bookmark[header];
    return `${header}: ${
      typeof value === "string" ? value : JSON.stringify(value, null, 2)
    }`;
  }).join("\n\n");

  let charIndex = 0;
  const animDuration = 10;
  const lettersAtATime = 8;

  alertBox.setContent(JSON.stringify(bookmark.metadata, null, 2));

  // Update mini map
  updateMiniMap(miniMap, bookmark);

  const typeOutSummary = () => {
    if (charIndex < summary.length) {
      const endIndex = Math.min(charIndex + lettersAtATime, summary.length);
      summaryBox.setContent(summary.slice(0, endIndex));
      screen.render();
      charIndex += lettersAtATime;
    } else {
      clearInterval(currentSummaryInterval);
    }
  };

  currentSummaryInterval = setInterval(typeOutSummary, animDuration);
}

// Update summary for selected bookmark
function updateSummary(
  index,
  currentBookmarks,
  summaryBox,
  alertBox,
  miniMap,
  screen
) {
  stopCurrentAnimation();
  viewSummary(index, currentBookmarks, summaryBox, alertBox, miniMap, screen);
}

// Update mini map for selected bookmark
function updateMiniMap(miniMap, bookmark) {
  miniMap.clearMarkers();
  if (bookmark.metadata.latitude && bookmark.metadata.longitude) {
    miniMap.addMarker({
      lat: bookmark.metadata.latitude,
      lon: bookmark.metadata.longitude,
      color: "red",
      char: "X",
    });
    miniMap.show(); // Show the map if there's location data
  } else {
    miniMap.hide(); // Hide the map if there's no location data
  }
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts(
  screen,
  table,
  summaryBox,
  alertBox,
  miniMap,
  searchQueryBox,
  fullScreenSummaryBox,
  bookmarks,
  updateDisplay
) {
  screen.key(["q", "C-c"], () => process.exit(0));

  screen.key(["h"], () => {
    summaryBox.setContent(displayHelp());
    screen.render();
  });

  screen.key(["escape"], () => {
    if (fullScreenSummaryBox.visible) {
      fullScreenSummaryBox.hide();
      screen.render();
    }
    stopCurrentAnimation();
    searchQueryBox.content = "";
    searchQueryBox.hide();
    updateDisplay(bookmarks);
  });

  screen.key(["j", "down"], () => {
    updateSummary(
      table.rows.selected + 1,
      bookmarks,
      summaryBox,
      alertBox,
      miniMap,
      screen
    );
    screen.render();
  });

  screen.key(["k", "up"], () => {
    updateSummary(
      table.rows.selected - 1,
      bookmarks,
      summaryBox,
      alertBox,
      miniMap,
      screen
    );
    screen.render();
  });

  screen.key(["space"], () => {
    const selected = table.rows.selected;
    updateSummary(selected, bookmarks, summaryBox, alertBox, miniMap, screen);
    const bookmark = bookmarks[selected];
    const href = bookmark.metadata.href;
    try {
      execSync(`open ${href}`);
      alertBox.setContent("Opening in browser: " + href);
    } catch (error) {
      alertBox.setContent("Error opening in browser: " + error);
    }
    setTimeout(() => {
      alertBox.setContent("");
      screen.render();
    }, 5000);
    screen.render();
  });

  screen.key(["pageup"], () => {
    table.rows.select(Math.max(0, table.rows.selected - 24));
    screen.render();
  });

  screen.key(["pagedown"], () => {
    table.rows.select(Math.min(bookmarks.length - 1, table.rows.selected + 24));
    screen.render();
  });

  screen.key(["right"], () => {
    const selected = table.rows.selected;
    const bookmark = bookmarks[selected];
    const href = bookmark.public_url;
    try {
      execSync(`echo ${href} | pbcopy`);
      alertBox.setContent("Copied to clipboard: " + href);
    } catch (error) {
      alertBox.setContent("Error copying to clipboard: " + error);
    }
    setTimeout(() => {
      alertBox.setContent("");
      screen.render();
    }, 5000);
    screen.render();
  });

  screen.key(["s", "/"], () => {
    showSearchBox(screen, alertBox, searchQueryBox, updateDisplay);
  });

  screen.key(["z"], () => {
    toggleFullScreenSummary(
      fullScreenSummaryBox,
      bookmarks,
      table.rows.selected
    );
    screen.render();
  });

  screen.key(["left"], () => {
    const selected = table.rows.selected;
    const bookmark = bookmarks[selected];
    const public_url = bookmark.public_url;
    try {
      execSync(`echo ${public_url} | pbcopy`);
      alertBox.setContent("Copied to clipboard: " + public_url);
    } catch (error) {
      alertBox.setContent("Error copying to clipboard: " + error);
    }
    setTimeout(() => {
      alertBox.setContent("");
      screen.render();
    }, 5000);
    screen.render();
  });

  // Refresh key
  screen.key(["r"], async () => {
    alertBox.setContent("Refreshing bookmarks...");
    screen.render();
    const newBookmarks = await reloadBookmarks(updateDisplay);
    bookmarks.length = 0;
    bookmarks.push(...newBookmarks);
    alertBox.setContent(`Refreshed ${newBookmarks.length} bookmarks`);
    screen.render();
    setTimeout(() => {
      alertBox.setContent("");
      screen.render();
    }, 3000);
  });
}

// Show search box
async function showSearchBox(screen, alertBox, searchQueryBox, updateDisplay) {
  const searchBox = blessed.textbox({
    parent: screen,
    top: "center",
    left: "center",
    height: 4,
    width: "50%",
    border: "line",
    style: {
      border: {
        fg: "black",
      },
    },
  });

  searchBox.focus();
  searchBox.setContent("");
  searchBox.readInput();

  searchBox.on("submit", async (text) => {
    if (!text) return;

    alertBox.setContent(`Searching for: ${text}\n`);
    searchQueryBox.setContent(text);
    searchQueryBox.show();

    const { data, error } = await supabase
      .from("scraps")
      .select("*")
      .textSearch(
        ["content", "tags", "summary"],
        text,
        {
          type: "websearch",
          config: "english",
        },
        { columns: "*" }
      )
      .order("created_at", { ascending: false });

    if (error) {
      alertBox.setContent(`Error searching bookmarks: ${error.message}`);
      screen.render();
      return;
    }

    updateDisplay(data);
    alertBox.setContent(`Found ${data.length} results`);
    screen.render();
    searchBox.destroy();
  });

  screen.render();
}

let summaryInterval;

// Toggle full screen summary view
function toggleFullScreenSummary(summaryBox, bookmarks, selectedIndex) {
  if (summaryInterval) {
    clearInterval(summaryInterval);
    summaryInterval = null;
  }

  if (summaryBox.visible) {
    summaryBox.hide();
    summaryBox.setContent("");
    summaryBox.screen.render();
  } else {
    summaryBox.setContent("");
    summaryBox.show();

    const bookmark = bookmarks[selectedIndex];
    let summary = ALL_HEADERS.map((header) => {
      const value = bookmark[header];
      return `${header}: ${
        typeof value === "string" ? value : JSON.stringify(value, null, 2)
      }`;
    }).join("\n\n");

    summary += "\n\nHit escape to close";

    let charIndex = 0;
    const words = summary.split(" ");
    const typeOutSummary = () => {
      if (charIndex < words.length) {
        summaryBox.setContent(words.slice(0, charIndex + 1).join(" "));
        summaryBox.screen.render();
        charIndex++;
      } else {
        clearInterval(summaryInterval);
        summaryBox.screen.render();
      }
    };

    summaryInterval = setInterval(typeOutSummary, 25);
  }
}

// Create map view
function createMapView(bookmarks) {
  const screen = blessed.screen({
    smartCSR: true,
    title: "ejfox.com/scrapbook Map View",
  });

  const grid = new contrib.grid({ rows: 12, cols: 16, screen: screen });
  const map = grid.set(0, 0, 12, 12, contrib.map, {
    label: "Scrapbook Map",
  });

  const infoBox = grid.set(0, 12, 12, 4, blessed.box, {
    label: "Bookmark Info",
    content: "Select a marker to view bookmark info",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    scrollbar: {
      ch: " ",
      inverse: true,
    },
  });

  // Add points to the map based on bookmark data
  const markers = bookmarks
    .filter(
      (bookmark) => bookmark.metadata.latitude && bookmark.metadata.longitude
    )
    .map((bookmark, index) => ({
      lon: bookmark.metadata.longitude,
      lat: bookmark.metadata.latitude,
      color: "green",
      char: "•",
      label: bookmark.scrap_id || bookmark.id,
      bookmarkData: bookmark,
      index: index,
    }));

  function updateMap() {
    map.clearMarkers();
    markers.forEach((marker) => map.addMarker(marker));
  }

  updateMap();

  let selectedMarkerIndex = -1;

  function updateSelectedMarker(newIndex) {
    if (newIndex >= 0 && newIndex < markers.length) {
      if (selectedMarkerIndex !== -1) {
        markers[selectedMarkerIndex].color = "green";
        markers[selectedMarkerIndex].char = "•";
      }
      selectedMarkerIndex = newIndex;
      markers[selectedMarkerIndex].color = "red";
      markers[selectedMarkerIndex].char = "X";
      showBookmarkInfo(markers[selectedMarkerIndex].bookmarkData);
      updateMap();
      screen.render();
    }
  }

  // Handle keyboard navigation
  screen.key(["q", "C-c"], () => process.exit(0));
  screen.key(["up"], () => updateSelectedMarker(selectedMarkerIndex - 1));
  screen.key(["down"], () => updateSelectedMarker(selectedMarkerIndex + 1));

  // Function to show bookmark info in the info box
  function showBookmarkInfo(bookmark) {
    infoBox.setContent(
      `Content: ${bookmark.content}\n\nMetadata: ${JSON.stringify(
        bookmark.metadata,
        null,
        2
      )}`
    );
  }

  screen.render();
}

// Reload bookmarks
async function reloadBookmarks(updateDisplay) {
  const newBookmarks = await loadBookmarks();
  updateDisplay(newBookmarks);
  return newBookmarks;
}

// Main function
async function main(options) {
  const bookmarks = await loadBookmarks();

  if (options.map) {
    createMapView(bookmarks);
    return;
  }

  const colorScale = createColorScale(bookmarks);
  let currentBookmarks = bookmarks;

  const screen = createScreen();
  const grid = createGrid(screen);
  const table = createTable(grid);
  const summaryBox = createSummaryBox(grid);
  const alertBox = createAlertBox(grid);
  const miniMap = createMiniMap(grid);
  const searchQueryBox = createSearchQueryBox(screen);
  const fullScreenSummaryBox = createFullScreenSummaryBox(screen);

  function updateDisplay(bookmarksToDisplay) {
    currentBookmarks = bookmarksToDisplay;
    const tableData = formatTableData(bookmarksToDisplay, colorScale);
    const coloredTableData = {
      headers: tableData.headers,
      data: tableData.data.map((row) => {
        const color = row.color;
        return row.map((cell) => chalk.hex(color)(cell));
      }),
    };
    table.setData(coloredTableData);
    alertBox.setContent(`Loaded ${bookmarksToDisplay.length} bookmarks`);
    screen.render();
  }

  updateDisplay(bookmarks);

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
}

// Display help information
function displayHelp() {
  const helpText = `
Scrapbook CLI

Usage: scrapbook-cli [options]

Options:
  -h, --help     Display this help message

Navigation:
  Up/Down        Navigate through bookmarks
  PageUp/PageDown Move 24 entries at a time
  Space          Open selected bookmark in browser
  Right Arrow    Copy public URL to clipboard
  Left Arrow     Copy scrapbook URL to clipboard
  Z              Toggle full-screen summary view
  S or /         Search bookmarks
  Esc            Exit search or full-screen view
  Q              Quit the application
  R              Refresh bookmarks  
Press 'h' while in the application to display this help.
  `;

  console.log(helpText);
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
