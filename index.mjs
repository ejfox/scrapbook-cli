#!/usr/bin/env node

import { Command } from "commander";
import { loadBookmarks, displayScrapJson, searchBookmarks, queryByEntity, formatBookmarksForFzf } from "./database.js";
import { loadConfig } from "./config.js";
import blessed from "blessed";
import { createUI, setupKeyboardShortcuts, displayHelp } from "./tui.js";
import { createMapView } from "./ui/map-view.js";
import { format } from "date-fns";

// Output formatters for CLI citizen mode
function outputJSON(data) {
  console.log(JSON.stringify(data, null, 2));
}

function outputJSONL(data) {
  data.forEach(item => console.log(JSON.stringify(item)));
}

function outputTSV(data) {
  if (!data || data.length === 0) return;

  // Get all keys from first item
  const keys = Object.keys(data[0]);

  // Header row
  console.log(keys.join("\t"));

  // Data rows
  data.forEach(item => {
    const values = keys.map(key => {
      const val = item[key];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val).replace(/\t/g, " ").replace(/\n/g, " ");
    });
    console.log(values.join("\t"));
  });
}

function outputCSV(data) {
  if (!data || data.length === 0) return;

  const keys = Object.keys(data[0]);

  // Header row
  console.log(keys.map(k => `"${k}"`).join(","));

  // Data rows
  data.forEach(item => {
    const values = keys.map(key => {
      const val = item[key];
      if (val === null || val === undefined) return '""';
      if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    console.log(values.join(","));
  });
}

function outputHumanReadable(data) {
  if (!data || data.length === 0) {
    console.log("No results found");
    return;
  }

  data.forEach((item, index) => {
    const date = format(new Date(item.created_at), "MM/dd");

    // Type icon
    const typeIcons = {
      video: "▶", article: "◇", bookmark: "◆", news: "▣",
      repo: "⌥", status: "◈", block: "□", image: "◫", youtube: "▶"
    };
    const type = item.content_type || item.type || item.source || "?";
    const icon = typeIcons[type.toLowerCase()] || "•";

    // Title or content preview
    let title = item.title && item.title !== "[no title]"
      ? item.title
      : (item.meta_summary || item.content || "[no title]");

    // Strip markdown and truncate
    const stripMarkdown = (text) => {
      if (!text) return "";
      return text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/```[\s\S]*?```/g, "")
        .trim();
    };

    title = stripMarkdown(title);
    if (title.length > 70) title = title.substring(0, 67) + "…";

    // Summary snippet
    let summary = item.summary ? stripMarkdown(item.summary) : "";
    summary = summary.replace(/\n/g, " ").trim();
    if (summary.length > 100) summary = summary.substring(0, 97) + "…";

    // Tags display
    const tags = item.tags && item.tags.length > 0 ? item.tags.slice(0, 2).join(", ") : "";
    const tagStr = tags ? ` #${tags}` : "";

    // URL
    const urlStr = item.url ? ` ${item.url}` : "";

    // Main line: date + icon + title
    console.log(`\n${date} ${icon} ${title}${tagStr}`);

    // Summary line if available
    if (summary) {
      console.log(`    ${summary}`);
    }

    // URL if available
    if (item.url) {
      console.log(`    ${item.url}`);
    }
  });

  console.log(`\n${data.length} result${data.length !== 1 ? "s" : ""} found`);
}

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

// TUI mode (default)
program
  .command("ui", { isDefault: true })
  .description("Launch interactive TUI (default)")
  .option("-m, --map", "Display a map of all bookmarks")
  .option("-t, --theme <theme>", "Use a specific theme preset")
  .action((options) => main(options));

// fzf mode - browse with external fzf
program
  .command("fzf")
  .description("Browse bookmarks with fzf and open selected")
  .option("-o, --open", "Open selected bookmark in browser")
  .option("-c, --copy", "Copy selected bookmark URL to clipboard")
  .option("--field <field>", "Output specific field of selection")
  .action(async (options) => {
    loadConfig({ silent: true });
    const bookmarks = await loadBookmarks();

    const { spawn } = await import("child_process");

    // Use shared formatting method
    const fzfInput = formatBookmarksForFzf(bookmarks);

    const fzf = spawn("fzf", [
      "--ansi",
      "--delimiter=\t",
      "--with-nth=2..",
      "--prompt=Search > ",
      "--height=100%",
      "--reverse",
      "--border",
      "--info=inline",
    ], { stdio: ["pipe", "pipe", "inherit"] });

    let output = "";
    fzf.stdout.on("data", (data) => { output += data.toString(); });

    fzf.on("close", async (code) => {
      if (code === 0 && output.trim()) {
        const index = parseInt(output.trim().split("\t")[0], 10);
        const bookmark = bookmarks[index];

        if (options.field) {
          console.log(bookmark[options.field]);
        } else if (options.open) {
          const { openUrl } = await import("./ui/safe-exec.js");
          await openUrl(bookmark.url);
          console.log(`Opened: ${bookmark.title || bookmark.url}`);
        } else if (options.copy) {
          const { copyToClipboard } = await import("./ui/safe-exec.js");
          await copyToClipboard(bookmark.url);
          console.log(`Copied: ${bookmark.url}`);
        } else {
          // Default: output full JSON
          console.log(JSON.stringify(bookmark, null, 2));
        }
      }
    });

    fzf.stdin.write(fzfInput);
    fzf.stdin.end();
  });

// List command with structured output options
program
  .command("list")
  .description("List all bookmarks in structured format")
  .option("--json", "Output as JSON array")
  .option("--jsonl", "Output as JSON Lines (one per line)")
  .option("--tsv", "Output as TSV (tab-separated values)")
  .option("--csv", "Output as CSV")
  .option("--fzf", "Output in fzf-compatible format for piping")
  .option("-l, --limit <n>", "Limit number of results", parseInt)
  .action(async (options) => {
    loadConfig({ silent: true });
    const bookmarks = await loadBookmarks();

    const limited = options.limit ? bookmarks.slice(0, options.limit) : bookmarks;

    if (options.json) {
      outputJSON(limited);
    } else if (options.jsonl) {
      outputJSONL(limited);
    } else if (options.tsv) {
      outputTSV(limited);
    } else if (options.csv) {
      outputCSV(limited);
    } else if (options.fzf) {
      const { formatBookmarksForFzf } = await import("./database.js");
      console.log(formatBookmarksForFzf(limited));
    } else {
      // Default: human-readable list
      outputHumanReadable(limited);
    }
  });

// Search command
program
  .command("search <query>")
  .description("Search bookmarks and output results")
  .option("--json", "Output as JSON array")
  .option("--jsonl", "Output as JSON Lines")
  .option("--tsv", "Output as TSV")
  .option("--csv", "Output as CSV")
  .option("--fzf", "Output in fzf-compatible format for piping")
  .action(async (query, options) => {
    loadConfig({ silent: true });
    const results = await searchBookmarks(query);

    if (options.json) {
      outputJSON(results);
    } else if (options.jsonl) {
      outputJSONL(results);
    } else if (options.tsv) {
      outputTSV(results);
    } else if (options.csv) {
      outputCSV(results);
    } else if (options.fzf) {
      const { formatBookmarksForFzf } = await import("./database.js");
      console.log(formatBookmarksForFzf(results));
    } else {
      outputHumanReadable(results);
    }
  });

// Get single bookmark
program
  .command("get <scrap_id>")
  .description("Get a specific bookmark by ID")
  .option("--json", "Output as JSON (default)")
  .option("-f, --field <field>", "Extract specific field (e.g., url, title)")
  .action(async (scrap_id, options) => {
    loadConfig({ silent: true });
    await displayScrapJson(scrap_id, options);
  });

// Entity graph queries
program
  .command("entity <name>")
  .description("Query knowledge graph by entity name")
  .option("--json", "Output full data as JSON")
  .option("--graph", "Output graph structure only")
  .option("--connections", "Show connections only")
  .action(async (name, options) => {
    loadConfig({ silent: true });
    try {
      const result = await queryByEntity(name);

      if (options.graph) {
        console.log(JSON.stringify(result.graph, null, 2));
      } else if (options.connections) {
        console.log(JSON.stringify(result.connections, null, 2));
      } else if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Human-readable output
        console.log(`\nEntity: ${result.query}`);
        console.log(`Found in ${result.total_scraps} scraps\n`);

        if (result.connections.length > 0) {
          console.log('Connected entities:');
          result.connections.forEach(conn => {
            const arrow = conn.direction === 'outgoing' ? '→' : '←';
            console.log(`  ${arrow} ${conn.entity}`);
            console.log(`     ${conn.relationship} (${conn.count}x)`);
          });
        }

        console.log(`\nUse --json to see full data, --graph for graph structure`);
      }
    } catch (error) {
      console.error('Error querying entity:', error.message);
      process.exit(1);
    }
  });

// Interactive graph exploration
program
  .command("graph <entity>")
  .description("Launch interactive TUI to explore entity relationships")
  .action(async (entity) => {
    loadConfig({ silent: true });
    try {
      const result = await queryByEntity(entity);

      if (result.total_scraps === 0) {
        console.log(`No relationships found for entity: ${entity}`);
        process.exit(1);
      }

      const { createEntityGraphView } = await import("./ui/entity-graph.js");
      createEntityGraphView(result, entity);
    } catch (error) {
      console.error('Error launching graph view:', error.message);
      process.exit(1);
    }
  });

// YouTube playlist commands
const youtube = program.command('youtube').description('YouTube playlist and transcription tools');

youtube
  .command('generate')
  .description('Generate yt-dlp playlist from YouTube bookmarks')
  .option('--tag <tags...>', 'Filter by tags')
  .option('--entity <entity>', 'Filter by knowledge graph entity')
  .option('--search <query>', 'Search in titles/descriptions')
  .option('--after <date>', 'Only videos after date (YYYY-MM-DD)')
  .option('--before <date>', 'Only videos before date (YYYY-MM-DD)')
  .option('-o, --output <file>', 'Output playlist file', 'playlist.txt')
  .option('--format <format>', 'Output format: txt, json, m3u', 'txt')
  .action(async (options) => {
    loadConfig({ silent: true });
    const { generatePlaylist } = await import('./youtube.js');
    await generatePlaylist(options);
  });

youtube
  .command('download')
  .description('Download videos with yt-dlp')
  .option('--tag <tags...>', 'Filter by tags')
  .option('--entity <entity>', 'Filter by entity')
  .option('--search <query>', 'Search query')
  .option('-o, --output-dir <dir>', 'Download directory', './youtube-downloads')
  .option('--audio-only', 'Download audio only (MP3)')
  .option('--subs', 'Download subtitles')
  .action(async (options) => {
    loadConfig({ silent: true });
    const { downloadVideos } = await import('./youtube.js');
    await downloadVideos(options);
  });

youtube
  .command('transcribe')
  .description('Download and transcribe videos with Whisper')
  .option('--entity <entity>', 'Filter by entity')
  .option('--tag <tags...>', 'Filter by tags')
  .option('--search <query>', 'Search query')
  .option('-o, --output-dir <dir>', 'Output directory', './transcriptions')
  .option('--model <model>', 'Whisper model (tiny, base, small, medium, large)', 'base')
  .option('--keep-audio', 'Keep downloaded audio files')
  .action(async (options) => {
    loadConfig({ silent: true });
    const { transcribeVideos } = await import('./youtube.js');
    await transcribeVideos(options);
  });

youtube
  .command('stats')
  .description('Analyze YouTube collection statistics')
  .action(async () => {
    loadConfig({ silent: true });
    const { showStats } = await import('./youtube.js');
    await showStats();
  });

// Stats command - quick overview of database
program
  .command("stats")
  .description("Show database statistics and field coverage")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    loadConfig({ silent: true });
    const bookmarks = await loadBookmarks();

    const stats = {
      total: bookmarks.length,
      sources: {},
      types: {},
      withSummary: 0,
      withRelationships: 0,
      withLocation: 0,
      withConceptTags: 0,
      withScreenshot: 0,
      shared: 0,
      avgTags: 0,
      avgRelationships: 0,
    };

    let totalTags = 0;
    let totalRels = 0;

    bookmarks.forEach(b => {
      // Count by source
      const src = b.source || "unknown";
      stats.sources[src] = (stats.sources[src] || 0) + 1;

      // Count by type
      const type = b.content_type || b.type || "unknown";
      stats.types[type] = (stats.types[type] || 0) + 1;

      // Field coverage
      if (b.summary) stats.withSummary++;
      if (b.relationships?.length > 0) stats.withRelationships++;
      if (b.location && b.location !== "Unknown") stats.withLocation++;
      if (b.concept_tags?.length > 0) stats.withConceptTags++;
      if (b.screenshot_url) stats.withScreenshot++;
      if (b.shared) stats.shared++;

      totalTags += b.tags?.length || 0;
      totalRels += b.relationships?.length || 0;
    });

    stats.avgTags = (totalTags / bookmarks.length).toFixed(1);
    stats.avgRelationships = (totalRels / bookmarks.length).toFixed(1);

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(`\n📊 Scrapbook Stats\n`);
      console.log(`Total: ${stats.total} scraps\n`);

      console.log(`Sources:`);
      Object.entries(stats.sources)
        .sort((a, b) => b[1] - a[1])
        .forEach(([src, count]) => {
          const pct = ((count / stats.total) * 100).toFixed(1);
          console.log(`  ${src}: ${count} (${pct}%)`);
        });

      console.log(`\nTypes:`);
      Object.entries(stats.types)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .forEach(([type, count]) => {
          const pct = ((count / stats.total) * 100).toFixed(1);
          console.log(`  ${type}: ${count} (${pct}%)`);
        });

      console.log(`\nField Coverage:`);
      console.log(`  Summary: ${stats.withSummary} (${((stats.withSummary / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Relationships: ${stats.withRelationships} (${((stats.withRelationships / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Location: ${stats.withLocation} (${((stats.withLocation / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Concept Tags: ${stats.withConceptTags} (${((stats.withConceptTags / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Screenshot: ${stats.withScreenshot} (${((stats.withScreenshot / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Shared/Public: ${stats.shared}`);

      console.log(`\nAverages:`);
      console.log(`  Tags per scrap: ${stats.avgTags}`);
      console.log(`  Relationships per scrap: ${stats.avgRelationships}`);
    }
  });

// Legacy json command (kept for backwards compatibility)
program
  .command("json <scrap_id>")
  .description("Display JSON for a specific scrap (legacy, use 'get' instead)")
  .action((scrap_id) => {
    loadConfig({ silent: true });
    displayScrapJson(scrap_id);
  });

program.option("-h, --help", "Display help information").action((options) => {
  if (options.help) {
    displayHelp();
  } else {
    main(options);
  }
});

program.parse(process.argv);
