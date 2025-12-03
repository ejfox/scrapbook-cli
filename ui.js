import blessed from "blessed";
import contrib from "blessed-contrib";
import { format } from "date-fns";
import config, { ALL_HEADERS } from "./config.js";
import {
  formatTableData,
  reloadBookmarks,
  searchBookmarks,
  formatRelationships,
  formatLocation,
  formatFinancialAnalysis,
  formatTags,
  stripMarkdown,
  formatContentType,
  formatConceptTags,
  formatExtractionConfidence,
  generateMetaSummary,
} from "./data.js";
import chalk from "chalk";
import { createForceLayoutView } from "./ui/force-layout.js";
import { uiState } from "./ui/state.js";
import { openUrl, copyToClipboard } from "./ui/safe-exec.js";

export function viewSummary(index, currentBookmarks, summaryBox, alertBox, miniMap, screen) {
  uiState.stopCurrentAnimation();

  // Reset scroll position to top when viewing a new scrap
  summaryBox.setScrollPerc(0);

  const bookmark = currentBookmarks[index];
  if (!bookmark) {
    summaryBox.setContent("No bookmark found for this index.");
    screen.render();
    return;
  }

  // Build a rich, useful preview
  const previewParts = [];

  // Header with title or URL
  if (bookmark.title) {
    const title = stripMarkdown(bookmark.title).substring(0, 60);
    previewParts.push(`{bold}{cyan-fg}${title}{/cyan-fg}{/bold}\n`);
  } else if (bookmark.url) {
    const url = bookmark.url.substring(0, 60);
    previewParts.push(`{bold}{cyan-fg}${url}{/cyan-fg}{/bold}\n`);
  }

  // META-SUMMARY - Use pre-computed field from database, fallback to generating if missing
  const metaSummary = bookmark.meta_summary || generateMetaSummary(bookmark);
  previewParts.push(`{yellow-fg}◈{/yellow-fg} ${metaSummary}\n`);

  // Date and Source
  const date = bookmark.created_at ? format(new Date(bookmark.created_at), "yyyy-MM-dd HH:mm") : "";
  const source = bookmark.source || "unknown";
  previewParts.push(`\n{dim}${date} · ${source}{/dim}\n`);

  // Quick stats
  const stats = [];
  if (bookmark.relationships && bookmark.relationships.length > 0) {
    stats.push(`{green-fg}${bookmark.relationships.length} links{/green-fg}`);
  }
  if (bookmark.tags && Array.isArray(bookmark.tags) && bookmark.tags.length > 0) {
    stats.push(`{magenta-fg}${bookmark.tags.length} tags{/magenta-fg}`);
  }
  if (bookmark.location && bookmark.location !== "Unknown") {
    stats.push(`{blue-fg}📍 ${bookmark.location}{/blue-fg}`);
  }
  if (stats.length > 0) {
    previewParts.push(`\n${stats.join(" · ")}\n`);
  }

  // Content type and confidence
  if (bookmark.content_type) {
    previewParts.push(`\n{dim}Type:{/dim} {yellow-fg}${bookmark.content_type.toUpperCase()}{/yellow-fg}`);
  }
  if (bookmark.extraction_confidence) {
    const avgConfidence =
      Object.values(bookmark.extraction_confidence).reduce((a, b) => a + b, 0) /
      Object.keys(bookmark.extraction_confidence).length;
    const confidencePct = Math.round(avgConfidence * 100);
    const confidenceColor = confidencePct > 80 ? "green" : confidencePct > 60 ? "yellow" : "red";
    previewParts.push(` · {${confidenceColor}-fg}${confidencePct}% confidence{/${confidenceColor}-fg}`);
  }

  // Tags preview
  if (bookmark.concept_tags && Array.isArray(bookmark.concept_tags) && bookmark.concept_tags.length > 0) {
    const tagPreview = bookmark.concept_tags
      .slice(0, 3)
      .map((tag) => `{cyan-fg}#${tag}{/cyan-fg}`)
      .join(" ");
    previewParts.push(`\n\n${tagPreview}`);
  } else if (bookmark.tags && Array.isArray(bookmark.tags) && bookmark.tags.length > 0) {
    const tagPreview = bookmark.tags
      .slice(0, 3)
      .map((tag) => `{cyan-fg}#${tag}{/cyan-fg}`)
      .join(" ");
    previewParts.push(`\n\n${tagPreview}`);
  }

  // Financial analysis preview
  if (bookmark.financial_analysis?.tracked_assets?.length > 0) {
    const assets = bookmark.financial_analysis.tracked_assets
      .slice(0, 3)
      .map((a) => `{green-fg}$${a.symbol}{/green-fg}`)
      .join(" ");
    previewParts.push(`\n\n{bold}Tracking:{/bold} ${assets}`);
  }

  // Keyboard shortcuts reminder at bottom
  previewParts.push(
    `\n\n{dim}───────────────{/dim}\n{dim}z=expand · space=open\nv=graph · r=refresh{/dim}`
  );

  const summary = previewParts.join("");

  // Type out animation
  let charIndex = 0;
  const animDuration = 10;
  const lettersAtATime = 12; // Faster animation for more responsive feel

  // Update status box with useful context
  const statusParts = [];

  // Show position
  statusParts.push(`${index + 1}/${currentBookmarks.length}`);

  // Show source
  if (bookmark.source) {
    statusParts.push(bookmark.source);
  }

  // Show metadata counts
  const tagCount = bookmark.tags?.length || 0;
  const relCount = bookmark.relationships?.length || 0;
  if (tagCount > 0 || relCount > 0) {
    statusParts.push(`${tagCount}  ${relCount}`);
  }

  alertBox.setContent(statusParts.join(" · "));

  updateMiniMap(miniMap, bookmark, summaryBox);

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

export function updateSummary(index, currentBookmarks, summaryBox, alertBox, miniMap, screen) {
  uiState.stopCurrentAnimation();
  const validIndex = Math.max(0, Math.min(index, currentBookmarks.length - 1));
  if (validIndex < currentBookmarks.length && currentBookmarks[validIndex]) {
    viewSummary(validIndex, currentBookmarks, summaryBox, alertBox, miniMap, screen);
  } else {
    summaryBox.setContent("No bookmark selected or data error.");
    screen.render();
  }
}

export function updateMiniMap(miniMap, bookmark, summaryBox) {
  miniMap.clearMarkers();

  // Check multiple possible locations for lat/lng data
  const lat = bookmark.latitude || bookmark.metadata?.latitude || bookmark.location?.latitude;
  const lng = bookmark.longitude || bookmark.metadata?.longitude || bookmark.location?.longitude;

  if (lat && lng) {
    // Has location: show map, shrink preview to normal size
    miniMap.addMarker({
      lat: parseFloat(lat),
      lon: parseFloat(lng),
      color: "red",
      char: "X",
    });
    miniMap.show();

    // Reset preview to normal size (rows 0-5, height 6)
    if (summaryBox) {
      summaryBox.height = 6;
      summaryBox.top = 0;
    }
  } else {
    // No location: hide map, expand preview to fill the space
    miniMap.hide();

    // Expand preview to cover map area (rows 0-9, height 10)
    if (summaryBox) {
      summaryBox.height = 10;
      summaryBox.top = 0;
    }
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
          // Color the date column dim, type column stays default, content gets emphasis
          if (index === 0) {
            return chalk.dim(safeCell); // Date
          } else if (index === 2) {
            return chalk.white(safeCell); // Content
          } else {
            return safeCell; // Type (emojis)
          }
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
      updateSummary(nextIndex, bookmarks, summaryBox, alertBox, miniMap, screen);
    }
    screen.render();
  });

  screen.key(["k", "up"], () => {
    const prevIndex = table.rows.selected - 1;
    if (prevIndex >= 0) {
      updateSummary(prevIndex, bookmarks, summaryBox, alertBox, miniMap, screen);
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
        alertBox.setContent(`{green-fg}✓ Copied:{/green-fg} ${href.substring(0, 50)}${href.length > 50 ? '…' : ''}`);
      } catch (error) {
        alertBox.setContent(`{red-fg}✗ Error:{/red-fg} ${error.message}`);
      }
      setTimeout(() => {
        const bookmark = bookmarks[selected];
        const statusParts = [];
        statusParts.push(`${selected + 1}/${bookmarks.length}`);
        if (bookmark.source) statusParts.push(bookmark.source);
        const tagCount = bookmark.tags?.length || 0;
        const relCount = bookmark.relationships?.length || 0;
        if (tagCount > 0 || relCount > 0) statusParts.push(`${tagCount}  ${relCount}`);
        alertBox.setContent(statusParts.join(" · "));
        screen.render();
      }, 2000);
      screen.render();
    }
  });

  screen.key(["s", "/"], () => {
    showSearchBox(screen, alertBox, searchQueryBox, updateDisplay, bookmarks);
  });

  screen.key(["z", "enter"], () => {
    toggleFullScreenSummary(fullScreenSummaryBox, bookmarks, table.rows.selected);
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
        alertBox.setContent(`{green-fg}✓ Copied:{/green-fg} ${public_url.substring(0, 50)}${public_url.length > 50 ? '…' : ''}`);
      } catch (error) {
        alertBox.setContent(`{red-fg}✗ Error:{/red-fg} ${error.message}`);
      }
      setTimeout(() => {
        const bookmark = bookmarks[selected];
        const statusParts = [];
        statusParts.push(`${selected + 1}/${bookmarks.length}`);
        if (bookmark.source) statusParts.push(bookmark.source);
        const tagCount = bookmark.tags?.length || 0;
        const relCount = bookmark.relationships?.length || 0;
        if (tagCount > 0 || relCount > 0) statusParts.push(`${tagCount}  ${relCount}`);
        alertBox.setContent(statusParts.join(" · "));
        screen.render();
      }, 2000);
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
  // Edge-to-edge table - use full terminal width
  const terminalWidth = process.stdout.columns || 80;

  // Optimized column layout for information density
  const dateWidth = 6;     // "MM/DD"
  const srcWidth = 5;      // Icon + count (e.g., " 12")
  const contentWidth = terminalWidth - dateWidth - srcWidth - 6; // Rest for content (minus borders/padding)

  return grid.set(0, 0, 12, 8, contrib.table, {
    keys: true,
    label: "", // No label for edge-to-edge
    border: "line", // Keep border but make it blend
    columnWidth: [
      dateWidth,
      srcWidth,
      Math.max(50, contentWidth), // Ensure minimum readable width
    ],
    vi: true,
    style: {
      border: { fg: config.theme?.colors?.borders?.default || "#595959" },
      header: {
        bold: true,
        fg: config.theme?.colors?.borders?.focus || "#ff1a90",
        align: "left",
      },
      cell: {
        selected: {
          bg: config.theme?.colors?.borders?.selected || "#e60067",
          fg: "#0d0d0d", // Dark text on bright bg
          bold: true,
        },
      },
    },
  });
}

function createSummaryBox(grid) {
  const highlightColor = config.theme?.colors?.text?.highlight || "#ff1a90";
  const borderColor = config.theme?.colors?.borders?.focus || "#ff1a90";

  return grid.set(0, 8, 6, 4, blessed.box, {
    label: " Preview ",
    content:
      "{bold}scrapbook-cli{/bold}\n\n" +
      `{${highlightColor}-fg}j/k{/${highlightColor}-fg}     Navigate\n` +
      `{${highlightColor}-fg}SPACE{/${highlightColor}-fg}   Open URL\n` +
      `{${highlightColor}-fg}s{/${highlightColor}-fg}       Search\n` +
      `{${highlightColor}-fg}z{/${highlightColor}-fg}       Expand\n` +
      `{${highlightColor}-fg}r{/${highlightColor}-fg}       Refresh\n` +
      `{${highlightColor}-fg}?{/${highlightColor}-fg}       Help\n` +
      `{${highlightColor}-fg}q{/${highlightColor}-fg}       Quit`,
    padding: 1,
    border: "line",
    tags: true,
    style: {
      border: { fg: borderColor },
      label: { fg: borderColor, bold: true },
    },
  });
}

function createAlertBox(grid) {
  const infoColor = config.theme?.colors?.borders?.info || "#ff66b5";

  return grid.set(10, 8, 2, 4, blessed.box, {
    label: " Status ",
    content: "",
    padding: { left: 1, right: 1 },
    border: { type: "line" },
    tags: true,
    style: {
      border: { fg: infoColor },
      label: { fg: infoColor, bold: true },
    },
  });
}

function createMiniMap(grid) {
  const borderColor = config.theme?.colors?.palette?.[4] || "#ff279a"; // Hot Pink

  return grid.set(6, 8, 4, 4, contrib.map, {
    label: " Location ",
    style: {
      border: { fg: borderColor },
    },
    // Map widget doesn't support custom colors well, keep it simple
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
  const highlightColor = config.theme?.colors?.borders?.focus || "#ff1a90";

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
      ch: "┃",
      track: {
        bg: "black",
      },
      style: {
        fg: highlightColor,
      },
    },
    padding: 1,
    style: {
      border: { fg: highlightColor },
      scrollbar: { fg: highlightColor },
    },
  });

  box.hide();
  return box;
}

export function displayHelp() {
  return `{bold}{cyan-fg}scrapbook-cli{/cyan-fg}{/bold} v1.0

{bold}{yellow-fg}─── Navigation ───{/yellow-fg}{/bold}
  {cyan-fg}↑/k{/cyan-fg}  {cyan-fg}↓/j{/cyan-fg}     Move up/down
  {cyan-fg}PgUp{/cyan-fg} {cyan-fg}PgDn{/cyan-fg}    Jump 24 entries

{bold}{yellow-fg}─── Actions ───{/yellow-fg}{/bold}
  {cyan-fg}z{/cyan-fg} {cyan-fg}Enter{/cyan-fg}      Expand summary
  {cyan-fg}Space{/cyan-fg}         Open in browser
  {cyan-fg}→{/cyan-fg}             Copy public URL
  {cyan-fg}←{/cyan-fg}             Copy entry URL
  {cyan-fg}s{/cyan-fg} {cyan-fg}/{/cyan-fg}          Search
  {cyan-fg}r{/cyan-fg}             Refresh data

{bold}{yellow-fg}─── Views ───{/yellow-fg}{/bold}
  {cyan-fg}v{/cyan-fg}             Relationship view
  {cyan-fg}f{/cyan-fg}             Force layout graph
  {cyan-fg}--map{/cyan-fg}         Map view (startup)

{bold}{yellow-fg}─── Help ───{/yellow-fg}{/bold}
  {cyan-fg}h{/cyan-fg}             Help in sidebar
  {cyan-fg}?{/cyan-fg}             This overlay

{bold}{yellow-fg}─── System ───{/yellow-fg}{/bold}
  {cyan-fg}Esc{/cyan-fg}           Exit current mode
  {cyan-fg}q{/cyan-fg}             Quit

{dim}Press ESC to close{/dim}`;
}

async function showSearchBox(screen, alertBox, searchQueryBox, updateDisplay, bookmarks) {
  const searchBox = blessed.textbox({
    parent: screen,
    top: "center",
    left: "center",
    height: 4,
    width: "50%",
    label: " Search ",
    border: "line",
    style: {
      border: { fg: "yellow" },
      label: { fg: "yellow", bold: true },
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

function showRelationshipView(screen, scrap, _bookmarks) {
  const relationshipBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "90%",
    height: "90%",
    border: { type: "line" },
    style: {
      border: { fg: "magenta" },
      label: { fg: "magenta", bold: true },
    },
    label: " Relationships ",
    tags: true,
    content: "",
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: "┃",
      style: { fg: "magenta" },
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
    if (!rel || typeof rel !== "object") return;

    // Handle both old and new schema formats
    const sourceName = rel.source?.name || rel.source || "Unknown";
    const sourceType = rel.source?.type || "";
    const targetName = rel.target?.name || rel.target || "Unknown";
    const targetType = rel.target?.type || "";
    const relType = rel.type || rel.relationship || "RELATED_TO";

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
        value !== null &&
        value !== undefined &&
        key !== "summary" && // Skip summary as we handle it separately
        !key.includes("embedding") && // Hide all embedding fields
        key !== "id" &&
        key !== "processing_instance_id" &&
        key !== "processing_started_at"
    )
    .map(([key, value]) => {
      let displayValue = "";

      if (key === "content_type") {
        displayValue = formatContentType(value);
      } else if (key === "concept_tags") {
        displayValue = formatConceptTags(value);
      } else if (key === "extraction_confidence") {
        displayValue = formatExtractionConfidence(value);
      } else if (key === "relationships" && Array.isArray(value)) {
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
        displayValue = "[\n  " + value.map((v) => chalk.green(`"${v}"`)).join(",\n  ") + "\n]";
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
  const fullContent = summaryContent ? `SUMMARY:\n${summaryContent}\n\n${content}` : content;

  summaryBox.setContent(fullContent + "\n\n" + chalk.dim("Use ↑/↓ to scroll, ESC to close"));

  // Reset scroll position to top when opening full-screen view
  summaryBox.setScrollPerc(0);

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
