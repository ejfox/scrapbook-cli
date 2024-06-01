import { Command } from "commander";
import blessed from "blessed";
import contrib from "blessed-contrib";
import axios from "axios";
import * as d3 from "d3";
import chalk from "chalk";
import { format } from "date-fns";
import { execSync } from "child_process";

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

  bookmarks.forEach((bookmark) => {
    bookmark[
      "public_url"
    ] = `https://ejfox.com/scrapbook/${bookmark["scrap_id"]}`;
  });

  bookmarks.sort((a, b) => new Date(b.time) - new Date(a.time));

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
      const animDuration = 50;
      const lettersAtAATime = 3;
      const viewSummary = (index) => {
        if (currentSummaryInterval) {
          clearInterval(currentSummaryInterval);
        }

        const bookmark = bookmarks[index];
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

      table.rows.on("select", (item, index) => {
        stopCurrentAnimation();
        viewSummary(index);
      });

      // screen.key(["space"], () => {
      //   const selected = table.rows.selected;
      //   stopCurrentAnimation();
      //   viewSummary(selected);
      // });

      // open the URL in browser on space
      screen.key(["space"], () => {
        const selected = table.rows.selected;
        const bookmark = bookmarks[selected];
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

      screen.key(["j", "down"], () => {
        stopCurrentAnimation();
        viewSummary(table.rows.selected);
        screen.render();
      });

      screen.key(["k", "up"], () => {
        stopCurrentAnimation();
        viewSummary(table.rows.selected);
        screen.render();
      });

      screen.key(["right"], () => {
        const selected = table.rows.selected;
        const bookmark = bookmarks[selected];
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

      screen.key(["left"], () => {
        const selected = table.rows.selected;
        const bookmark = bookmarks[selected];
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
