import blessed from "blessed";
import contrib from "blessed-contrib";
import { execSync } from "child_process";
import { format } from "date-fns";
import { SCRAP_TYPE_SYMBOLS, VIEW_HEADERS, ALL_HEADERS } from "./constants.js";
import { formatTableData, reloadBookmarks, searchBookmarks } from "./data.js";
import chalk from "chalk";

let currentSummaryInterval;
let fullScreenSummaryInterval;
let fullScreenSummaryScrollOffset = 0;
const fullScreenSummaryLinesPerPage = 20;

function stopCurrentAnimation() {
  if (currentSummaryInterval) {
    clearInterval(currentSummaryInterval);
    currentSummaryInterval = null;
  }
}

export function viewSummary(
  index,
  currentBookmarks,
  summaryBox,
  alertBox,
  miniMap,
  screen
) {
  stopCurrentAnimation();

  const bookmark = currentBookmarks[index];
  if (!bookmark) {
    summaryBox.setContent("No bookmark found for this index.");
    screen.render();
    return;
  }

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

export function updateSummary(
  index,
  currentBookmarks,
  summaryBox,
  alertBox,
  miniMap,
  screen
) {
  stopCurrentAnimation();
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

  screen.key(["space"], () => {
    const selected = table.rows.selected;
    if (selected >= 0 && selected < bookmarks.length) {
      updateSummary(selected, bookmarks, summaryBox, alertBox, miniMap, screen);
      const bookmark = bookmarks[selected];
      const url = bookmark.url;
      try {
        execSync(`open ${url}`);
        alertBox.setContent("Opening in browser: " + url);
      } catch (error) {
        alertBox.setContent("Error opening in browser: " + error);
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

  screen.key(["right"], () => {
    const selected = table.rows.selected;
    if (selected >= 0 && selected < bookmarks.length) {
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
    }
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
  });

  screen.key(["v"], () => {
    const selectedIndex = table.rows.selected;
    if (selectedIndex >= 0 && selectedIndex < bookmarks.length) {
      const selectedScrap = bookmarks[selectedIndex];
      showRelationshipView(screen, selectedScrap, bookmarks);
    }
  });

  screen.key(["left"], () => {
    const selected = table.rows.selected;
    if (selected >= 0 && selected < bookmarks.length) {
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
  const totalWidth = process.stdout.columns - 4; // Account for borders

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
    label: "Summary (z to zoom)",
    content:
      "Welcome to scrapbook CLI\n\n" +
      "NAVIGATE : ↑↓\n" +
      "OPEN     : SPACE\n" +
      "SEARCH   : s\n" +
      "ZOOM     : z\n" +
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
  SPACE    Open in browser
  →        Copy public URL
  ←        Copy scrapbook URL
  Z        Expand summary
  S/       Search mode
  V        View relationships
  R        Refresh data

SYSTEM
  ESC      Exit current mode
  Q        Quit

Status: Active
`;
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
      const data = await searchBookmarks(text);
      updateDisplay(data);
      alertBox.setContent(`Found ${data.length} results`);
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
    content += `${rel.source.name} [${rel.source.type}] --${rel.type}--> ${rel.target.name} [${rel.target.type}]\n`;
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
    summaryContent = bookmark.summary
      .split("\n")
      .map((line) => `  ⟡ ${line}`) // Unicode bullet for summary lines
      .join("\n");
  }

  const content = Object.entries(bookmark)
    .filter(
      ([key, value]) =>
        value !== null && value !== undefined && key !== "summary"
    ) // Skip summary as we handle it separately
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

export function createMapView(bookmarks) {
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

  markers.forEach((marker) => map.addMarker(marker));

  let selectedMarkerIndex = -1;

  function showBookmarkInfo(bookmark) {
    infoBox.setContent(
      `Content: ${bookmark.content}\n\nMetadata: ${JSON.stringify(
        bookmark.metadata,
        null,
        2
      )}`
    );
  }

  screen.key(["q", "C-c"], () => process.exit(0));
  screen.key(["up"], () => {
    if (selectedMarkerIndex > 0) {
      selectedMarkerIndex--;
      showBookmarkInfo(markers[selectedMarkerIndex].bookmarkData);
      screen.render();
    }
  });
  screen.key(["down"], () => {
    if (selectedMarkerIndex < markers.length - 1) {
      selectedMarkerIndex++;
      showBookmarkInfo(markers[selectedMarkerIndex].bookmarkData);
      screen.render();
    }
  });

  screen.render();
}
