import { Command } from "commander";
import blessed from "blessed";
import contrib from "blessed-contrib";
import * as d3 from "d3";
import chalk from "chalk";
import { format } from "date-fns";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
dotenv.config();

export const scrapTypeSymbols = {
  pinboard: "■", // U+25A0
  "mastodon-post": "▲", // U+25B2
  mastodon: "▲", // U+25B2
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
  const instructions = `Welcome to the scrapbook CLI! Up/down keys navigate, right arrow copies the URL to the clipboard. Press spacebar to open in the browser. Press Z to fullscreen the summary. Press / or 's' to search. Press q to quit.`;

  const loadBookmarks = async () => {
    const { data, error } = await supabase
      .from("scraps")
      .select("*")
      .order("created_at", { ascending: false });
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
  // const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(scrapTypes);
  // use different shades of blue
  const colorScale = d3.scaleOrdinal([
    // cyberpunk green
    "#00FF00",
    // cyberpunk blue
    "#00FFFF",
    // cyberpunk yellow
    "#FFFF00",
    // cyberpunk orange
    "#FFA500",
    // cyberpunk gray
    "#808080",
  ]);

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
  const viewHeaders = ["created_at", "scrap_id", "source", "content"];

  const tableData = {
    headers: viewHeaders,
    data: bookmarks.map((bookmark) => {
      const row = viewHeaders.map((header) => {
        if (header === "created_at") {
          return format(new Date(bookmark[header]), "yyyy-MM-dd");
        } else if (header === "source") {
          // get the correct symbol for this source
          const scrapTypeSymbol = scrapTypeSymbols[bookmark[header]] || "";
          return `${scrapTypeSymbol} ${bookmark[header] || ""}`;
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
        title: "ejfox.com/scrapbook CLI",
        // other cool options
        dockBorders: true,
        fullUnicode: true,
        autoPadding: true,
        // warnings: true,
      });

      const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

      const table = grid.set(0, 0, 12, 8, contrib.table, {
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

      const box = grid.set(0, 8, 8, 4, blessed.box, {
        label: "Summary",
        content: instructions,
        padding: 1,
        border: { type: "line" },
        style: {
          border: { fg: "green" },
          focus: { border: { fg: "yellow" } },
        },
      });

      const alertBox = grid.set(8, 8, 4, 4, blessed.box, {
        content: "",
        padding: 0,
        border: { type: "line" },
        style: {
          focus: { border: { fg: "yellow" } },
        },
      });

      // an itty bitty box for the search query, if there is one
      // in the lower left corner, in red
      const searchQueryBox = blessed.box({
        parent: screen,
        top: "90%",
        left: "2%",
        height: 3,
        width: 20,
        content: "",
        padding: 1,
        style: {
          // fg: "red",
          bg: "red",
          fg: "white",
        },
      });

      // hide it
      searchQueryBox.hide();

      const summaryBox = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        // height: "92%",
        // width: "92%",
        width: "100%",
        height: "100%",
        border: null,
        // border: {
        //   type: "line",
        // },
        // padding: 10,
        padding: 0,
        style: {
          // fg: "white",
          // bg: "black",
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

      // alertBox.setContent(instructions);
      // set the total rows loaded in the alertBox
      alertBox.setContent(`Loaded ${bookmarks.length} bookmarks`);

      screen.key(["q", "C-c"], () => process.exit(0));

      // if we hit esc, check if the summaryBox is open, close it
      // check if we searchin? stop searching, return to normal view
      screen.key(["escape"], () => {
        if (summaryBox.visible) {
          summaryBox.hide();

          screen.render();
        }

        // cancel any typing that might be happening
        if (currentSummaryInterval) {
          clearInterval(currentSummaryInterval);
        }

        searchQueryBox.content = "";
        searchQueryBox.hide();

        if (currentBookmarks !== bookmarks) {
          currentBookmarks = bookmarks;
          const coloredTableData = {
            headers: tableData.headers,
            data: tableData.data.map((row) => {
              const color = row.color;
              return row.map((cell) => chalk.hex(color)(cell));
            }),
          };
          table.setData(coloredTableData);
          screen.render();
        }
      });

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
          .map((header) => {
            const value = bookmark[header];
            return `${header}: ${
              typeof value === "string" ? value : JSON.stringify(value, null, 2)
            }`;
          })
          .join("\n\n");

        let charIndex = 0;

        // console.log bookmark to the alertBox
        alertBox.setContent(JSON.stringify(bookmark.metadata, null, 2));

        // if (bookmark.metadata) {
        //   let screenshotUrl = null;
        //   if (bookmark.metadata.screenshotUrl) {
        //     screenshotUrl = bookmark.metadata.screenshotUrl;
        //   } else if (bookmark.metadata.images) {
        //     if (!bookmark.metadata.images.length) {
        //       return;
        //     }
        //     screenshotUrl = bookmark.metadata.images[0];
        //   }

        //   if (!screenshotUrl) {
        //     return;
        //   }
        //   // tell the alert box we are fetching the screenshot
        //   alertBox.setContent("Fetching screenshot: " + screenshotUrl);

        //   try {
        //     axios
        //       .get(screenshotUrl, { responseType: "arraybuffer" })
        //       .then((response) => {
        //         // alert box the size of the screenshot
        //         alertBox.setContent(
        //           `Fetched screenshot: ${screenshotUrl} (${response.data.byteLength} bytes)`
        //         );

        //         // wow we actually need to put this in a /tmp/ folder so it can be read by blessed.image
        //         // fs.writeFileSync("/tmp/screenshot.png", response.data)
        //         // we need to do a .then() on the writeFileSync to make sure it's done before we try to read it
        //         fs.writeFile("./tmp/screenshot.png", response.data, (err) => {
        //           if (err) {
        //             alertBox.setContent("Error writing screenshot: " + err);
        //           } else {
        //             alertBox.setContent(
        //               "Wrote screenshot to /tmp/screenshot.png"
        //             );
        //             // refactor to use blessed image
        //             const image = blessed.image({
        //               // parent: screen,
        //               // parent: box,
        //               top: "center",
        //               left: "center",
        //               // width: "25%",
        //               width: 10,
        //               // height: "80%",
        //               file: "./tmp/screenshot.png",
        //               search: false,
        //               ansi: false,
        //             });
        //             // append the image to the box
        //             box.append(image);

        //             screen.render();
        //           }
        //         });
        //       });
        //   } catch (e) {
        //     alertBox.setContent("Error fetching screenshot: " + e);
        //   }

        //   screen.render();
        // }

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
        // const href = bookmark["public_url"];
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

      screen.key(["s", "/"], () => {
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

          // show the search query box
          searchQueryBox.setContent(text);
          searchQueryBox.show();

          if (!text) {
            return;
          }

          // Perform full-text search using Supabase's fts function
          const { data, error } = await supabase
            .from("scraps")
            .select("*")
            // .textSearch("content", text, {
            //   type: "websearch",
            //   config: "english",
            // });
            // expand to tags, content, and metadata
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
          // or, order by relevance
          // .order("rank", { ascending: false });

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

      // screen.key(["z"], () => {
      //   summaryBox.show();
      //   const selected = table.rows.selected;
      //   const bookmark = currentBookmarks[selected];
      //   const summary = headers
      //     .map((header) => {
      //       const value = bookmark[header];
      //       return `${header}: ${
      //         typeof value === "string" ? value : JSON.stringify(value)
      //       }`;
      //     })
      //     .join("\n\n");

      //   summaryBox.setContent(summary);
      //   screen.render();

      //   screen.key(["z"], () => {
      //     summaryBox.hide();
      //     screen.render();
      //   });
      // });

      // refactor to fix bug with summary box
      screen.key(["z"], () => {
        if (summaryBox.visible) {
          summaryBox.hide();
          // empty and hide the search query box
          searchBox.setContent("");
          searchBox.hide();
        } else {
          // empty the summary box
          summaryBox.setContent("");
          summaryBox.show();

          const selected = table.rows.selected;
          const bookmark = currentBookmarks[selected];
          let summary = headers
            .map((header) => {
              const value = bookmark[header];
              return `${header}: ${
                typeof value === "string"
                  ? value
                  : JSON.stringify(value, null, 2)
              }`;
            })
            .join("\n\n");

          const finalMessage = `Hit escape to close`;

          summary = summary.concat("\n\n" + finalMessage);

          let charIndex = 0;
          const words = summary.split(" ");
          const typeOutSummary = () => {
            if (charIndex < words.length) {
              summaryBox.setContent(words.slice(0, charIndex + 1).join(" "));
              screen.render();
              charIndex++;
            } else {
              clearInterval(summaryInterval);
              // const image = blessed.image({
              //   // parent: screen,
              //   parent: summaryBox,
              //   top: "center",
              //   left: "center",
              //   width: "10%",
              //   file: "./tmp/screenshot.png",
              //   // ansi: false,
              //   // type: "overlay",
              //   // put it at the bottom
              //   position: "bottom",
              // });

              // summaryBox.append(image);

              screen.render();
            }
          };

          const summaryInterval = setInterval(typeOutSummary, 50);
          screen.render();
        }
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
