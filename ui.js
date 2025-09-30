import blessed from "blessed";
import contrib from "blessed-contrib";
import { format } from "date-fns";
import { SCRAP_TYPE_SYMBOLS, VIEW_HEADERS, ALL_HEADERS } from "./constants.js";
import {
  formatTableData,
  reloadBookmarks,
  searchBookmarks,
  formatRelationships,
  formatLocation,
  formatFinancialAnalysis,
  formatTags,
  formatSummary,
  stripMarkdown
} from "./data.js";
import chalk from "chalk";
import { createForceLayoutView } from "./ui/force-layout.js";
import { uiState } from "./ui/state.js";
import { openUrl, copyToClipboard } from "./ui/safe-exec.js";

export function viewSummary(
  index,
  currentBookmarks,
  summaryBox,
  alertBox,
  miniMap,
  screen
) {
  uiState.stopCurrentAnimation();

  const bookmark = currentBookmarks[index];
  if (!bookmark) {
    summaryBox.setContent("No bookmark found for this index.");
    screen.render();
    return;
  }

  // Filter out embedding fields and other technical fields from display
  const displayHeaders = ALL_HEADERS.filter(header =>
    !header.includes('embedding') &&
    header !== 'id' &&
    header !== 'processing_instance_id' &&
    header !== 'processing_started_at'
  );

  const summary = displayHeaders.map((header) => {
    const value = bookmark[header];
    let formattedValue;

    if (!value) {
      formattedValue = "";
    } else if (header === "relationships") {
      formattedValue = formatRelationships(value);
    } else if (header === "location") {
      formattedValue = formatLocation(value);
    } else if (header === "financial_analysis") {
      formattedValue = formatFinancialAnalysis(value);
    } else if (header === "tags") {
      formattedValue = formatTags(value);
    } else if (header === "summary") {
      formattedValue = value; // Keep full summary in detail view
    } else if (header === "created_at" || header === "updated_at") {
      formattedValue = format(new Date(value), "yyyy-MM-dd HH:mm");
    } else if (typeof value === "string") {
      formattedValue = value;
    } else {
      formattedValue = JSON.stringify(value, null, 2);
    }

    return formattedValue ? `${header}: ${formattedValue}` : null;
  }).filter(Boolean).join("\n\n");

  let charIndex = 0;
  const animDuration = 10;
  const lettersAtATime = 8;

  alertBox.setContent(JSON.stringify(bookmark.metadata, null, 2));

  updateMiniMap(miniMap, bookmark);

  const typeOutSummary = () => {
    if (charIndex < summary.length) {
      const endIndex = Math.min(charIndex + lettersAtATime, summary.length);
      summaryBox.setContent(summary.slice(0, endIndex));
      screen.render();
      charIndex += lettersAtATime;
    } else {
      clearInterval(uiState.currentSummaryInterval);
    }
  };

  uiState.setCurrentInterval(setInterval(typeOutSummary, animDuration));
}

export function updateSummary(
  index,
  currentBookmarks,
  summaryBox,
  alertBox,
  miniMap,
  screen
) {
  uiState.stopCurrentAnimation();
  const validIndex = Math.max(0, Math.min(index, currentBookmarks.length - 1));
  if (validIndex < currentBookmarks.length && currentBookmarks[validIndex]) {
    viewSummary(
      validIndex,
      currentBookmarks,
      summaryBox,
      alertBox,
      miniMap,
      screen
    );
  } else {
    summaryBox.setContent("No bookmark selected or data error.");
    screen.render();
  }
}

export function updateMiniMap(miniMap, bookmark) {
  miniMap.clearMarkers();
  if (bookmark.metadata.latitude && bookmark.metadata.longitude) {
    miniMap.addMarker({
      lat: bookmark.metadata.latitude,
      lon: bookmark.metadata.longitude,
      color: "red",
      char: "X",
    });
    miniMap.show();
  } else {
    miniMap.hide();
  }
}

export function createUI(bookmarks) {
  const screen = blessed.screen({
    smartCSR: true,
    title: "ejfox.com/scrapbook CLI",
    dockBorders: true,
    fullUnicode: true,
    autoPadding: true,
  });
  const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });
  const table = createTable(grid);
  const summaryBox = createSummaryBox(grid);
  const alertBox = createAlertBox(grid);
  const miniMap = createMiniMap(grid);
  const searchQueryBox = createSearchQueryBox(screen);
  const fullScreenSummaryBox = createFullScreenSummaryBox(screen);

  function updateDisplay(bookmarksToDisplay) {
    const tableData = formatTableData(bookmarksToDisplay);
    const coloredTableData = {
      headers: tableData.headers,
      data: tableData.data.map((row) => {
        if (!Array.isArray(row)) return [];
        return row.map((cell, index) => {
          const safeCell = (cell ?? "").toString();
          return index === 1 ? chalk.green(safeCell) : safeCell;
        });
      }),
    };

    table.setData(coloredTableData);
    alertBox.setContent(`${bookmarksToDisplay.length} bookmarks`);
    screen.render();
  }

  updateDisplay(bookmarks);

  return {
    table,
    screen,
    summaryBox,
    alertBox,
    miniMap,
    searchQueryBox,
    fullScreenSummaryBox,
    updateDisplay,
  };
}

export function setupKeyboardShortcuts(
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

  screen.key(["?"], () => {
    // Show help in full-screen overlay
    fullScreenSummaryBox.setContent(displayHelp());
    fullScreenSummaryBox.show();
    screen.render();
  });

  screen.key(["f"], () => {
    // Show force layout view of relationships for current bookmark
    const currentIndex = table.rows.selected || 0;
    const currentBookmark = bookmarks[currentIndex];
    if (currentBookmark) {
      createForceLayoutView([currentBookmark], screen, currentBookmark, () => {
        // Restore focus to table when force layout closes
        table.focus();
      });
    } else {
      alertBox.setContent("No bookmark selected for force layout view");
      screen.render();
    }
  });

  screen.key(["escape"], () => {
    if (fullScreenSummaryBox.visible) {
      fullScreenSummaryBox.hide();
      screen.render();
    }
    uiState.stopCurrentAnimation();
    searchQueryBox.content = "";
    searchQueryBox.hide();
    reloadBookmarks(updateDisplay).then((newBookmarks) => {
      bookmarks.length = 0;
      bookmarks.push(...newBookmarks);
    });
  });

  screen.key(["j", "down"], () => {
    const nextIndex = table.rows.selected + 1;
    if (nextIndex < bookmarks.length) {
      updateSummary(
        nextIndex,
        bookmarks,
        summaryBox,
        alertBox,
        miniMap,
        screen
      );
    }
    screen.render();
  });

  screen.key(["k", "up"], () => {
    const prevIndex = table.rows.selected - 1;
    if (prevIndex >= 0) {
      updateSummary(
        prevIndex,
        bookmarks,
        summaryBox,
        alertBox,
        miniMap,
        screen
      );
    }
    screen.render();
  });

  screen.key(["space"], async () => {
    const selected = table.rows.selected;
    if (selected >= 0 && selected < bookmarks.length) {
      updateSummary(selected, bookmarks, summaryBox, alertBox, miniMap, screen);
      const bookmark = bookmarks[selected];
      const url = bookmark.url;
      try {
        await openUrl(url);
        alertBox.setContent("Opening in browser: " + url);
      } catch (error) {
        alertBox.setContent("Error opening in browser: " + error.message);
      }
      setTimeout(() => {
        alertBox.setContent("");
        screen.render();
      }, 5000);
      screen.render();
    }
  });

  screen.key(["pageup"], () => {
    summaryBox.scroll(-(summaryBox.height || 10));
    summaryBox.screen.render();
  });

  screen.key(["pagedown"], () => {
    table.rows.select(Math.min(bookmarks.length - 1, table.rows.selected + 24));
    screen.render();
  });

  screen.key(["right"], async () => {
    const selected = table.rows.selected;
    if (selected >= 0 && selected < bookmarks.length) {
      const bookmark = bookmarks[selected];
      const href = bookmark.public_url;
      try {
        await copyToClipboard(href);
        alertBox.setContent("Copied to clipboard: " + href);
      } catch (error) {
        alertBox.setContent("Error copying to clipboard: " + error.message);
      }
      setTimeout(() => {
        alertBox.setContent("");
        screen.render();
      }, 5000);
      screen.render();
    }
  });

  screen.key(["s", "/"], () => {
    showSearchBox(screen, alertBox, searchQueryBox, updateDisplay, bookmarks);
  });

  screen.key(["z", "enter"], () => {
    toggleFullScreenSummary(
      fullScreenSummaryBox,
      bookmarks,
      table.rows.selected
    );
  });

  screen.key(["v"], () => {
    const selectedIndex = table.rows.selected;
    if (selectedIndex >= 0 && selectedIndex < bookmarks.length) {
      const selectedScrap = bookmarks[selectedIndex];
      showRelationshipView(screen, selectedScrap, bookmarks);
    }
  });

  screen.key(["left"], async () => {
    const selected = table.rows.selected;
    if (selected >= 0 && selected < bookmarks.length) {
      const bookmark = bookmarks[selected];
      const public_url = bookmark.public_url;
      try {
        await copyToClipboard(public_url);
        alertBox.setContent("Copied to clipboard: " + public_url);
      } catch (error) {
        alertBox.setContent("Error copying to clipboard: " + error.message);
      }
      setTimeout(() => {
        alertBox.setContent("");
        screen.render();
      }, 5000);
      screen.render();
    }
  });

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

function createTable(grid) {
  // Ensure we have a valid terminal width, default to 80 if not available
  const terminalWidth = process.stdout.columns || 80;
  const totalWidth = Math.max(50, terminalWidth - 4); // Account for borders, minimum 50

  // Calculate proportional widths
  const dateWidth = Math.floor(totalWidth * 0.15); // 15% for date
  const sourceWidth = Math.floor(totalWidth * 0.15); // 15% for source
  const contentWidth = totalWidth - dateWidth - sourceWidth; // Rest for content

  return grid.set(0, 0, 12, 8, contrib.table, {
    keys: true,
    label: "Bookmarks",
    columnWidth: [
      Math.max(10, dateWidth), // Min 10 chars for date
      Math.max(8, sourceWidth), // Min 8 chars for source
      Math.max(20, contentWidth), // Min 20 chars for content
    ],
    vi: true,
    style: {
      header: {
        bold: true,
        align: "left",
      },
      cell: {
        selected: {
          bg: "green",
          fg: "black",
        },
      },
    },
  });
}

function createSummaryBox(grid) {
  return grid.set(0, 8, 6, 4, blessed.box, {
    label: "Summary (enter/z to zoom)",
    content:
      "Welcome to scrapbook CLI\n\n" +
      "NAVIGATE : ↑↓\n" +
      "OPEN     : SPACE\n" +
      "SEARCH   : s\n" +
      "ZOOM     : ENTER or z\n" +
      "REFRESH  : r\n" +
      "QUIT     : q",
    padding: 1,
    border: "line",
  });
}

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

function createMiniMap(grid) {
  return grid.set(6, 8, 4, 4, contrib.map, {
    label: "Location",
    style: {
      shapeColor: "cyan",
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
    width: "90%",
    height: "90%",
    content: "",
    tags: true,
    border: "line",
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: "█",
      track: {
        bg: "black",
      },
      style: {
        inverse: true,
      },
    },
    padding: 1,
  });

  box.hide();
  return box;
}

export function displayHelp() {
  return `
Scrapbook CLI v1.0

NAVIGATION
  ↑/↓        Browse entries
  PgUp/PgDn  Jump 24 entries

ACTIONS
  ENTER/Z    Expand summary
  SPACE      Open in browser
  →          Copy public URL
  ←          Copy scrapbook URL
  S/         Search mode
  V          View relationships
  F          Force layout of current bookmark
  R          Refresh data

VIEWS
  --map      Map view (startup option)

HELP
  H          Help in sidebar
  ?          Full help overlay

SYSTEM
  ESC        Exit current mode
  Q          Quit

Status: Active
`;
}

async function showSearchBox(
  screen,
  alertBox,
  searchQueryBox,
  updateDisplay,
  bookmarks
) {
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

    try {
      const searchResults = await searchBookmarks(text);
      bookmarks.length = 0;
      bookmarks.push(...searchResults);

      updateDisplay(bookmarks);
      alertBox.setContent(`Found ${searchResults.length} results`);
    } catch (error) {
      alertBox.setContent(error.message);
    }
    screen.render();
    searchBox.destroy();
  });

  screen.render();
}

function showRelationshipView(screen, scrap, bookmarks) {
  const relationshipBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "90%",
    height: "90%",
    border: {
      type: "line",
    },
    style: {
      border: {
        fg: "white",
      },
    },
    label: "Relationship View",
    content: "",
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: " ",
      inverse: true,
    },
  });

  if (!scrap.relationships || scrap.relationships.length === 0) {
    relationshipBox.setContent("No relationships found for this scrap.");
    screen.append(relationshipBox);
    relationshipBox.focus();
    screen.render();
    return;
  }

  let content = `Relationships for: ${scrap.scrap_id}\n\n`;
  scrap.relationships.forEach((rel) => {
    // Skip empty or invalid relationships
    if (!rel || typeof rel !== 'object') return;

    // Handle both old and new schema formats
    const sourceName = rel.source?.name || rel.source || 'Unknown';
    const sourceType = rel.source?.type || '';
    const targetName = rel.target?.name || rel.target || 'Unknown';
    const targetType = rel.target?.type || '';
    const relType = rel.type || rel.relationship || 'RELATED_TO';

    if (sourceType && targetType) {
      content += `${sourceName} [${sourceType}] --${relType}--> ${targetName} [${targetType}]\n`;
    } else {
      content += `${sourceName} --${relType}--> ${targetName}\n`;
    }
  });
  content += "\n\nPress ESC to close";

  relationshipBox.setContent(content);
  relationshipBox.key(["escape"], () => {
    screen.remove(relationshipBox);
    screen.render();
  });

  screen.append(relationshipBox);
  relationshipBox.focus();
  screen.render();
}

export function toggleFullScreenSummary(summaryBox, bookmarks, selectedIndex) {
  if (summaryBox.visible) {
    summaryBox.hide();
    summaryBox.screen.render();
    return;
  }

  const bookmark = bookmarks[selectedIndex];
  if (!bookmark) {
    summaryBox.setContent(chalk.red("No bookmark found for this index."));
    summaryBox.screen.render();
    return;
  }

  let summaryContent = "";
  if (bookmark.summary) {
    const cleanSummary = stripMarkdown(bookmark.summary);
    summaryContent = cleanSummary
      .split("\n")
      .map((line) => `  ⟡ ${line}`) // Unicode bullet for summary lines
      .join("\n");
  }

  const content = Object.entries(bookmark)
    .filter(
      ([key, value]) =>
        value !== null && value !== undefined &&
        key !== "summary" && // Skip summary as we handle it separately
        !key.includes('embedding') && // Hide all embedding fields
        key !== 'id' &&
        key !== 'processing_instance_id' &&
        key !== 'processing_started_at'
    )
    .map(([key, value]) => {
      let displayValue = "";

      if (key === "relationships" && Array.isArray(value)) {
        displayValue =
          "[\n  " +
          value
            .filter((rel) => rel && rel.source && rel.target) // Filter out invalid relationships
            .map((rel) =>
              chalk.green(
                JSON.stringify(
                  {
                    source: rel.source?.name || rel.source,
                    type: rel.type,
                    target: rel.target?.name || rel.target,
                  },
                  null,
                  2
                )
              )
            )
            .join(",\n  ") +
          "\n]";
      } else if (Array.isArray(value)) {
        displayValue =
          "[\n  " +
          value.map((v) => chalk.green(`"${v}"`)).join(",\n  ") +
          "\n]";
      } else if (typeof value === "object") {
        const jsonString = JSON.stringify(value, null, 2);
        displayValue =
          "\n" +
          jsonString
            .split("\n")
            .map((line) => {
              if (line.includes(":")) {
                const [k, v] = line.split(/:(.*)/);
                return k + ":" + chalk.green(v || "");
              }
              return line;
            })
            .join("\n");
      } else if (key === "url" || key === "public_url") {
        displayValue = chalk.green(value.toString());
      } else if (key === "content" || key === "title") {
        // Strip markdown from content and title fields
        displayValue = stripMarkdown(value.toString());
      } else {
        displayValue = value.toString();
      }

      // Add different Unicode markers for different types of fields
      const marker =
        key === "content"
          ? "◉" // Big dot for content
          : key === "title"
          ? "❯" // Arrow for title
          : key === "tags"
          ? "⊛" // Star for tags
          : key === "url"
          ? "⌘" // Command symbol for URLs
          : "•"; // Default bullet

      return `${marker} ${key}: ${displayValue}`;
    })
    .join("\n\n");

  // Combine summary at the top with the rest of the content
  const fullContent = summaryContent
    ? `SUMMARY:\n${summaryContent}\n\n${content}`
    : content;

  summaryBox.setContent(
    fullContent + "\n\n" + chalk.dim("Use ↑/↓ to scroll, ESC to close")
  );

  summaryBox.show();
  summaryBox.focus();

  summaryBox.key(["escape", "z"], () => {
    summaryBox.hide();
    summaryBox.screen.render();
  });

  summaryBox.key(["up"], () => {
    summaryBox.scroll(-1);
    summaryBox.screen.render();
  });

  summaryBox.key(["down"], () => {
    summaryBox.scroll(1);
    summaryBox.screen.render();
  });

  summaryBox.screen.render();
}

// Map view function has been moved to ui/map-view.js

// Force layout function has been moved to ui/force-layout.js
