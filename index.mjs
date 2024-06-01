import { Command } from "commander";
import blessed from "blessed";
import contrib from "blessed-contrib";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as d3 from "d3";
import { format, parse, formatDistance } from "date-fns";
import { execSync } from "child_process";

(async () => {
  const instructions = `Welcome to the scrapbook CLI! Up/down keys navigate, right arrow copies the URL to the clipboard. Press spacebar to view the summary. Press q to quit.`;

  const loadBookmarks = async () => {
    try {
      const response = await axios.get(
        "http://ejfox.com/data/scrapbook/scraps.json"
      );
      const bookmarks = response.data;
      return bookmarks;
    } catch (error) {
      console.error("Error loading bookmarks:", error);
      return [];
    }
  };

  const bookmarks = await loadBookmarks();

  // go through the bookmarks and add a public_url field
  // shaped like https://ejfox.com/scrapbook/${scrap_id}
  bookmarks.forEach((bookmark) => {
    bookmark[
      "public_url"
    ] = `https://ejfox.com/scrapbook/${bookmark["scrap_id"]}`;
  });

  const scrapTypes = Array.from(new Set(bookmarks.map((b) => b.type)));
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(scrapTypes);

  // Determine headers dynamically
  const headers = Object.keys(bookmarks[0]);
  const viewHeaders = ["time", "scrap_id", "type", "href"];

  // Prepare table data
  const tableData = {
    headers: viewHeaders,
    data: bookmarks.map((bookmark) =>
      viewHeaders.map((header) => {
        if (header === "time") {
          return format(new Date(bookmark[header]), "yyyy-MM-dd");
        } else {
          return bookmark[header] || "";
        }
      })
    ),
  };

  const program = new Command();

  program
    .command("list")
    .description("List all bookmarks")
    .action(async () => {
      // Initialize the terminal interface
      const screen = blessed.screen({
        smartCSR: true,
        title: "Bookmark CLI",
      });

      const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

      const table = grid.set(0, 0, 12, 8, contrib.table, {
        keys: true,
        fg: "green",
        label: "Bookmarks",
        columnWidth: [10, 4, 4, 40], // Adjust width as needed
        vi: true, // Enable vim keys
        style: {
          header: {
            fg: "cyan",
            bold: true,
            align: "left", // Add this line to left align the headers
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

      // add a mapbox that shows locations of all bookmarks with a .geolocation field
      // const map = grid.set(9, 8, 3, 4, contrib.map, {
      //   label: "Map",
      //   style: { border: { fg: "green" } },
      //   focus: { border: { fg: "yellow" } },
      // });
      // bookmarks.forEach((bookmark) => {
      //   if (bookmark.geolocation) {
      //     const [longitude, latitude] = bookmark.geolocation.split(",");
      //     map.addMarker({ lon: longitude, lat: latitude });
      //   }
      // });

      // add a bar chart graph that shows the posts by type
      // const bar = grid.set(9, 0, 3, 8, contrib.bar, {
      //   label: "Bar Chart",
      //   barWidth: 10,
      //   barSpacing: 2,
      //   xOffset: 1,
      //   maxHeight: 10,
      //   style: { border: { fg: "green" } },
      //   focus: { border: { fg: "yellow" } },
      // });
      // bookmarks.forEach((bookmark) => {
      //   bar.setData([
      //     {
      //       x: bookmark.type,
      //       y: 1,
      //     },
      //   ]);
      // });

      const vizBoz = grid.set(9, 0, 3, 8, blessed.box, {
        label: "Viz",
        padding: 1,
        border: { type: "line" },
        style: {
          border: { fg: "green" },
          focus: { border: { fg: "yellow" } },
        },
      });

      // Calculate posts per day
      const postsPerDay = bookmarks.reduce((acc, bookmark) => {
        const date = format(new Date(bookmark.time), "yyyy-MM-dd");
        acc[date] = acc[date] ? acc[date] + 1 : 1;
        return acc;
      }, {});

      // Calculate posts per day by type
      const postsPerDayByType = bookmarks.reduce((acc, bookmark) => {
        const date = format(new Date(bookmark.time), "yyyy-MM-dd");
        if (!acc[date]) acc[date] = {};
        if (!acc[date][bookmark.type]) acc[date][bookmark.type] = 0;
        acc[date][bookmark.type]++;
        return acc;
      }, {});

      // Sort bookmarks by time
      bookmarks.sort((a, b) => new Date(a.time) - new Date(b.time));

      // Sort dates and limit to past 7 days
      const sortedDates = Object.keys(postsPerDayByType).sort(
        (a, b) => new Date(a) - new Date(b)
      );
      const past7Days = sortedDates.slice(-7);

      const barData = {
        titles: past7Days.map((date, index) => `T-${7 - index}`),
        data: [],
        barColors: [],
      };

      // Aggregate data for stacked bar chart
      // past7Days.forEach((date) => {
      //   let totalPosts = 0;
      //   scrapTypes.forEach((type) => {
      //     const count = postsPerDayByType[date][type] || 0;
      //     totalPosts += count;
      //     barData.data.push(count);
      //     barData.barColors.push(colorScale(type));
      //   });
      // });

      // // Create the stacked bar chart
      // const bar = contrib.stackedBar({
      //   label: "Posts per day",
      //   barWidth: 4,
      //   barSpacing: 2,
      //   xOffset: 1,
      //   maxHeight: 10,
      //   style: {
      //     border: { fg: "green" },
      //     bar: { fg: "green" },
      //     label: { fg: "white" },
      //     text: { fg: "white" },
      //   },
      //   barBgColor: "green",
      //   data: barData,
      //   width: "100%-2",
      //   height: "100%-2",
      // });

      // vizBoz.append(bar);

      const alertBox = grid.set(9, 8, 3, 4, blessed.box, {
        // label: "Alert",
        content: "",
        padding: 1,
        border: { type: "line" },
        style: {
          // border: { fg: "green" },
          focus: { border: { fg: "yellow" } },
        },
      });

      table.setData(tableData);

      // add the instructions to the alert box
      alertBox.setContent(instructions);

      screen.key(["escape", "q", "C-c"], () => process.exit(0));

      let currentSummaryInterval;
      const animDuration = 1;
      const lettersAtAATime = 3;
      const viewSummary = (index) => {
        // Clear any previous animation
        if (currentSummaryInterval) {
          clearInterval(currentSummaryInterval);
        }

        const bookmark = bookmarks[index];
        const summary = headers
          .map((header) => `${header}: ${bookmark[header]}`)
          .join("\n\n");

        let charIndex = 0;

        // Function to type out the summary
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

        // Start the typing animation
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

      screen.key(["space"], () => {
        const selected = table.rows.selected;
        stopCurrentAnimation();
        viewSummary(selected);
      });

      // Vim-style navigation
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

      // make it so right-arrow copies the href to the clipboard
      screen.key(["right"], () => {
        const selected = table.rows.selected;
        const bookmark = bookmarks[selected];
        const href = bookmark["href"];
        // copy to clipboard with exec pbcopy
        try {
          execSync(`echo ${href} | pbcopy`);
          // console.log("copied to clipboard: ", href);
          alertBox.setContent("Copied to clipboard: " + href);
        } catch (error) {
          // console.error("Error copying to clipboard:", error);
          alertBox.setContent("Error copying to clipboard: " + error);
        }

        // clear the alertbox after 5 seconds
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
