import { Command } from "commander";
import blessed from "blessed";
import contrib from "blessed-contrib";
import * as d3 from "d3";
import chalk from "chalk";
import { format } from "date-fns";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

export const scrapTypeSymbols = {
  pinboard: "■", // U+25A0
  "mastodon-post": "▲", // U+25B2
  arena: "●", // U+25BC
  github: "◆", // U+25C6
  "github-star": "◆", // U+25C6
  // 'github-pr': '◆', // U+25C6
  // slight difference in shape
  "github-pr": "◇", // U+25C7
  twitter: "○", // U+25CB
};
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  const instructions = `Welcome to the scrapbook CLI! Up/down keys navigate, right arrow copies the URL to the clipboard. Press spacebar to view the summary. Press q to quit.`;

  const loadBookmarks = async () => {
    const { data, error } = await supabase.from("scraps").select("*");
    if (error) {
      console.error("Error loading bookmarks:", error);
      return [];
    }
    return data;
  };

  const bookmarks = await loadBookmarks();
  let currentBookmarks = bookmarks;

  // Generate public URLs
  bookmarks.forEach((bookmark) => {
    bookmark["public_url"] = bookmark["scrap_id"]
      ? `https://ejfox.com/scrapbook/${bookmark["scrap_id"]}`
      : `https://ejfox.com/scrapbook/${bookmark["id"]}`;
  });

  bookmarks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const scrapTypes = Array.from(new Set(bookmarks.map((b) => b.source)));
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(scrapTypes);

  const headers = [
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
  const viewHeaders = ["created_at", "scrap_id", "source", "public_url"];

  const tableData = {
    headers: viewHeaders,
    data: bookmarks.map((bookmark) => {
      const row = viewHeaders.map((header) => {
        if (header === "created_at") {
          return format(new Date(bookmark[header]), "yyyy-MM-dd");
        } else {
          return bookmark[header] || "";
        }
      });
      row.color = colorScale(bookmark.source);
      return row;
    }),
  };

  const program = new Command();

  program
    .command("list")
    .description("List all bookmarks")
    .action(async () => {
      const screen = blessed.screen({
        smartCSR: true,
        title: "Bookmark CLI",
      });

      const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

      const table = grid.set(0, 0, 12, 8, contrib.table, {
        keys: true,
        fg: "green",
        label: "Bookmarks",
        columnWidth: [15, 15, 15, 40],
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

      const box = grid.set(0, 8, 9, 4, blessed.box, {
        label: "Summary",
        content: "Press spacebar to view the summary",
        padding: 1,
        border: { type: "line" },
        style: {
          border: { fg: "green" },
          focus: { border: { fg: "yellow" } },
        },
      });

      const alertBox = grid.set(9, 8, 3, 4, blessed.box, {
        content: "",
        padding: 1,
        border: { type: "line" },
        style: {
          focus: { border: { fg: "yellow" } },
        },
      });

      const summaryBox = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        height: "80%",
        width: "80%",
        border: null,
        padding: 1,
        style: {
          border: {
            fg: "green",
          },
        },
      });

      screen.append(summaryBox);
      summaryBox.hide();

      const coloredTableData = {
        headers: tableData.headers,
        data: tableData.data.map((row) => {
          const color = row.color;
          return row.map((cell) => chalk.hex(color)(cell));
        }),
      };

      table.setData(coloredTableData);

      alertBox.setContent(instructions);

      screen.key(["escape", "q", "C-c"], () => process.exit(0));

      let currentSummaryInterval;
      const animDuration = 10;
      const lettersAtAATime = 8;

      const viewSummary = (index) => {
        if (summaryBox.visible) {
          summaryBox.hide();
          screen.render();
        }

        if (currentSummaryInterval) {
          clearInterval(currentSummaryInterval);
        }

        const bookmark = currentBookmarks[index];
        const summary = headers
          .map((header) => `${header}: ${bookmark[header]}`)
          .join("\n\n");

        let charIndex = 0;

        const typeOutSummary = () => {
          if (charIndex < summary.length) {
            const endIndex = Math.min(
              charIndex + lettersAtAATime,
              summary.length
            );
            box.setContent(summary.slice(0, endIndex));
            screen.render();
            charIndex += lettersAtAATime;
          } else {
            clearInterval(currentSummaryInterval);
          }
        };

        currentSummaryInterval = setInterval(typeOutSummary, animDuration);
      };

      const stopCurrentAnimation = () => {
        if (currentSummaryInterval) {
          clearInterval(currentSummaryInterval);
          currentSummaryInterval = null;
        }
      };

      const updateSummary = (index) => {
        stopCurrentAnimation();
        viewSummary(index);
      };

      screen.key(["j", "down"], () => {
        updateSummary(table.rows.selected + 1);
        screen.render();
      });

      screen.key(["k", "up"], () => {
        updateSummary(table.rows.selected - 1);
        screen.render();
      });

      screen.key(["space"], () => {
        const selected = table.rows.selected;
        updateSummary(selected);
        const bookmark = currentBookmarks[selected];
        const href = bookmark["public_url"];
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

      // pgup / pgdown skip 24 at a time
      screen.key(["pageup"], () => {
        table.rows.select(Math.max(0, table.rows.selected - 24));
        screen.render();
      });

      screen.key(["pagedown"], () => {
        table.rows.select(
          Math.min(currentBookmarks.length - 1, table.rows.selected + 24)
        );
        screen.render();
      });

      screen.key(["right"], () => {
        const selected = table.rows.selected;
        const bookmark = currentBookmarks[selected];
        const href = bookmark["public_url"];
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

      screen.key(["s"], () => {
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

        searchBox.on("submit", async () => {
          const text = searchBox.getValue();

          alertBox.setContent(`Searching for: ${text}\n`);

          searchBox.setContent("");
          screen.remove(searchBox);

          if (!text) {
            return;
          }

          // Perform full-text search using Supabase's fts function
          const { data, error } = await supabase
            .from("scraps")
            .select("*")
            .textSearch("content", text, {
              type: "websearch",
              config: "english",
            });

          if (error) {
            alertBox.setContent(`Error searching bookmarks: ${error.message}`);
            screen.render();
            return;
          }

          currentBookmarks = data;

          const resultsWithScores = data
            .map((result) => {
              return `${result.content}`;
            })
            .join("\n");

          alertBox.setContent(
            `Found ${currentBookmarks.length} results\n\n${resultsWithScores}`
          );
          screen.render();

          // update the table with the filtered bookmarks
          const filteredTableData = {
            headers: viewHeaders,
            data: currentBookmarks.map((bookmark) => {
              return viewHeaders.map((header) => bookmark[header] || "");
            }),
          };

          const coloredFilteredTableData = {
            headers: filteredTableData.headers,
            data: filteredTableData.data.map((row, index) => {
              const color = colorScale(currentBookmarks[index].source);
              return row.map((cell) => chalk.hex(color)(cell));
            }),
          };

          table.setData(coloredFilteredTableData);
          screen.render();
          searchBox.destroy();
        });

        screen.render();
      });

      screen.key(["z"], () => {
        summaryBox.show();
        const selected = table.rows.selected;
        const bookmark = currentBookmarks[selected];
        const summary = headers
          .map((header) => `${header}: ${bookmark[header]}`)
          .join("\n\n");

        summaryBox.setContent(summary);
        screen.render();

        screen.key(["z"], () => {
          summaryBox.hide();
          screen.render();
        });
      });

      screen.key(["left"], () => {
        const selected = table.rows.selected;
        const bookmark = currentBookmarks[selected];
        const public_url = bookmark["public_url"];
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

      table.focus();
      screen.render();
    });

  program.parse(process.argv);
})();
