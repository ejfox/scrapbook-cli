import { Command } from "commander";
import blessed from "blessed";
import contrib from "blessed-contrib";
import axios from "axios";
import * as d3 from "d3";
import chalk from "chalk";
import { format } from "date-fns";
import { execSync } from "child_process";
import Fuse from "fuse.js";

(async () => {
  const instructions = `Welcome to the scrapbook CLI! Up/down keys navigate, right arrow copies the URL to the clipboard. Press spacebar to view the summary. Press q to quit.`;

  const loadBookmarks = async () => {
    try {
      const response = await axios.get(
        "http://ejfox.com/data/scrapbook/scraps.json"
      );
      return response.data;
    } catch (error) {
      console.error("Error loading bookmarks:", error);
      return [];
    }
  };

  const bookmarks = await loadBookmarks();
  let currentBookmarks = bookmarks;

  bookmarks.forEach((bookmark) => {
    bookmark[
      "public_url"
    ] = `https://ejfox.com/scrapbook/${bookmark["scrap_id"]}`;
  });

  bookmarks.sort((a, b) => new Date(b.time) - new Date(a.time));

  const options = {
    threshold: 0.3,
    distance: 100,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 3,
  };

  const fuse = new Fuse(bookmarks, {
    keys: ["description", "extended", "tags"],
    ...options,
  });

  const scrapTypes = Array.from(new Set(bookmarks.map((b) => b.type)));
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(scrapTypes);

  const headers = Object.keys(bookmarks[0]);
  const viewHeaders = ["time", "scrap_id", "type", "href"];

  const tableData = {
    headers: viewHeaders,
    data: bookmarks.map((bookmark) => {
      const row = viewHeaders.map((header) => {
        if (header === "time") {
          return format(new Date(bookmark[header]), "yyyy-MM-dd");
        } else {
          return bookmark[header] || "";
        }
      });
      row.color = colorScale(bookmark.type);
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
        columnWidth: [10, 4, 4, 40],
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
        data: tableData.data.map((row, index) => {
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

        const bookmark = currentBookmarks[index]; // Use currentBookmarks instead of bookmarks
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
        const currentBookmarks = bookmarks;
        const bookmark = currentBookmarks[selected];
        const href = bookmark["href"];
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

      screen.key(["right"], () => {
        const selected = table.rows.selected;
        const bookmark = currentBookmarks[selected];
        const href = bookmark["href"];
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

        searchBox.on("submit", () => {
          const text = searchBox.getValue();

          alertBox.setContent(`Searching for: ${text}\n`);

          searchBox.setContent("");
          screen.remove(searchBox);

          if (!text) {
            return;
          }

          const results = fuse.search(text);
          currentBookmarks = results.map((result) => result.item);

          const resultsWithScores = results
            .map((result) => {
              return `${result.item.description} (Score: ${result.score})`;
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
              const color = colorScale(currentBookmarks[index].type);
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
