import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { format } from "date-fns";
import * as d3 from "d3";
import { COLOR_PALETTE } from "./constants.js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function loadBookmarks() {
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

export function createColorScale(bookmarks) {
  return d3.scaleOrdinal(COLOR_PALETTE);
}

export function formatTableData(bookmarks) {
  return {
    headers: ["created_at", "source", "content"],
    data: bookmarks.map((bookmark) => {
      const row = ["created_at", "source", "content"].map((header) => {
        if (header === "created_at") {
          return format(new Date(bookmark[header]), "yyyy-MM-dd");
        } else if (header === "source") {
          return bookmark[header] || "";
        } else {
          return bookmark[header] || "";
        }
      });
      row.color = bookmark.source === "pinboard" ? "#00FF00" : "#FFFFFF";
      return row;
    }),
  };
}

export async function reloadBookmarks(updateDisplay) {
  const bookmarks = await loadBookmarks();
  if (updateDisplay) {
    updateDisplay(bookmarks);
  }
  return bookmarks;
}

export async function searchBookmarks(query) {
  const { data, error } = await supabase
    .from("scraps")
    .select("*")
    .textSearch(
      ["content", "tags", "summary"],
      query,
      {
        type: "websearch",
        config: "english",
      },
      { columns: "*" }
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error searching bookmarks: ${error.message}`);
  }

  return data;
}

export async function displayScrapJson(scrap_id) {
  try {
    const { data, error } = await supabase
      .from("scraps")
      .select("*")
      .eq("scrap_id", scrap_id)
      .single();

    if (error) throw error;

    if (data) {
      delete data.embedding;
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`No scrap found with ID: ${scrap_id}`);
    }
  } catch (error) {
    console.error("Error fetching scrap:", error.message);
  }
}
