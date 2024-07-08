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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

function createColorScale(bookmarks) {
  const scrapTypes = Array.from(new Set(bookmarks.map((b) => b.source)));
  return d3.scaleOrdinal(COLOR_PALETTE).domain(scrapTypes);
}

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

function createScreen() {
  return blessed.screen({
    smartCSR: true,
    title: "ejfox.com/scrapbook CLI",
    dockBorders: true,
    fullUnicode: true,
    autoPadding: true,
  });
}

function createGrid(screen) {
  return new contrib.grid({ rows: 12, cols: 12, screen: screen });
}

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

function createSummaryBox(grid) {
  return grid.set(0, 8, 8, 4, blessed.box, {
    label: "Summary",
    content: "Welcome to the scrapbook CLI!",
    padding: 1,
    border: { type: "line" },
    style: {
      border: { fg: "green" },
      focus: { border: { fg: "yellow" } },
    },
  });
}

function createAlertBox(grid) {
  return grid.set(8, 8, 4, 4, blessed.box, {
    content: "",
    padding: 0,
    border: { type: "line" },
    style: {
      focus: { border: { fg: "yellow" } },
    },
  });
}

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

function stopCurrentAnimation() {
  if (currentSummaryInterval) {
    clearInterval(currentSummaryInterval);
    currentSummaryInterval = null;
  }
}

function viewSummary(index, currentBookmarks, summaryBox, alertBox, screen) {
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

function updateSummary(index, currentBookmarks, summaryBox, alertBox, screen) {
  stopCurrentAnimation();
  viewSummary(index, currentBookmarks, summaryBox, alertBox, screen);
}

function setupKeyboardShortcuts(
  screen,
  table,
  summaryBox,
  alertBox,
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
      screen
    );
    screen.render();
  });

  screen.key(["space"], () => {
    const selected = table.rows.selected;
    updateSummary(selected, bookmarks, summaryBox, alertBox, screen);
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
}

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
        fg: "green",
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

function toggleFullScreenSummary(summaryBox, bookmarks, selectedIndex) {
  if (summaryBox.visible) {
    summaryBox.hide();
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

    const summaryInterval = setInterval(typeOutSummary, 50);
  }
}

async function main() {
  const bookmarks = await loadBookmarks();
  const colorScale = createColorScale(bookmarks);
  let currentBookmarks = bookmarks;

  const screen = createScreen();
  const grid = createGrid(screen);
  const table = createTable(grid);
  const summaryBox = createSummaryBox(grid);
  const alertBox = createAlertBox(grid);
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
    searchQueryBox,
    fullScreenSummaryBox,
    bookmarks,
    updateDisplay
  );

  table.focus();
  screen.render();
}

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

Press 'h' while in the application to display this help.
  `;

  console.log(helpText);
}

const program = new Command();
program
  .name("scrapbook-cli")
  .description("CLI for managing and viewing scrapbook entries")
  .version("1.0.0");

program.command("list").description("List all bookmarks").action(main);

program.option("-h, --help", "Display help information").action((options) => {
  if (options.help) {
    displayHelp();
  } else {
    main();
  }
});

program.parse(process.argv);
