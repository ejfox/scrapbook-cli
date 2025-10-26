import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { format } from "date-fns";
import * as d3 from "d3";
import config, { COLOR_PALETTE } from "./config.js";

dotenv.config();

// Get Supabase config with environment variable fallback for security
const supabaseUrl = config.database?.supabase_url || process.env.SUPABASE_URL;
const supabaseKey = config.database?.supabase_key || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_KEY in environment or config.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function loadBookmarks() {
  const tableName = config.database?.table || "scraps";
  const orderBy = config.database?.order_by || "created_at";
  const orderDirection = config.database?.order_direction || "desc";
  const selectFields = config.database?.default_select || "*";
  const limit = config.database?.default_limit || 1000;

  const { data, error } = await supabase
    .from(tableName)
    .select(selectFields)
    .order(orderBy, { ascending: orderDirection === "asc" })
    .limit(limit);

  if (error) {
    console.error(`Error loading bookmarks from ${tableName}:`, error.message);
    throw new Error(`Failed to load bookmarks: ${error.message}`);
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
        } else if (header === "content") {
          // Show content if available, otherwise show title, otherwise show URL
          const rawContent = bookmark.content || bookmark.title || bookmark.url || "";
          const cleanContent = stripMarkdown(rawContent);
          return cleanContent ? cleanContent.substring(0, 80) + "..." : "";
        } else {
          return bookmark[header] || "";
        }
      });

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
  const tableName = config.database?.table || "scraps";
  const searchColumns = config.database?.search_columns || ["content", "tags", "summary", "title"];
  const searchType = config.database?.search_type || "websearch";
  const searchConfig = config.database?.search_config || "english";
  const orderBy = config.database?.order_by || "created_at";
  const orderDirection = config.database?.order_direction || "desc";

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .textSearch(
      searchColumns,
      query,
      {
        type: searchType,
        config: searchConfig,
      },
      { columns: "*" }
    )
    .order(orderBy, { ascending: orderDirection === "asc" });

  if (error) {
    throw new Error(`Error searching bookmarks: ${error.message}`);
  }

  return data;
}

// Schema-aware formatting functions
export function formatRelationships(relationships) {
  if (!relationships || !Array.isArray(relationships)) return "";

  return relationships.map(rel => {
    const source = rel.source?.name || rel.source;
    const target = rel.target?.name || rel.target;
    const type = rel.type || rel.relationship;
    return `${source} ${type} ${target}`;
  }).join(", ");
}

export function formatLocation(location) {
  if (!location) return "";

  // Handle case where location is stored as JSON string
  let locationObj = location;
  if (typeof location === "string") {
    try {
      locationObj = JSON.parse(location);
    } catch (e) {
      return location; // Return as-is if not valid JSON
    }
  }

  const main = locationObj.location || "";
  const others = locationObj.metadata?.otherLocations || [];
  const otherNames = others.map(loc => loc.location).join(", ");

  return otherNames ? `${main} (+ ${otherNames})` : main;
}

export function formatFinancialAnalysis(financial) {
  if (!financial) return "";

  const tracked = financial.tracked_assets?.map(asset => asset.symbol).join(", ") || "";
  const discovered = financial.discovered_assets?.map(asset => asset.name).join(", ") || "";
  const sentiment = financial.overall_market_sentiment;

  let result = [];
  if (tracked) result.push(`Tracked: ${tracked}`);
  if (discovered) result.push(`Discovered: ${discovered}`);
  if (sentiment !== undefined) result.push(`Sentiment: ${sentiment > 0 ? '+' : ''}${sentiment}`);

  return result.join(" | ");
}

export function formatTags(tags) {
  if (!tags) return "";
  if (Array.isArray(tags)) return tags.join(", ");
  return tags;
}

export function stripMarkdown(text) {
  if (!text) return "";

  return text
    // Remove headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Remove horizontal rules
    .replace(/^-{3,}$/gm, "")
    .replace(/^={3,}$/gm, "")
    // Remove blockquotes
    .replace(/^>\s+/gm, "")
    // Clean up extra whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatSummary(summary) {
  if (!summary) return "";
  // Remove bullet points for inline display and strip markdown
  const cleaned = stripMarkdown(summary).replace(/^•\s*/gm, "").replace(/\n/g, " ");
  return cleaned.length > 100 ? cleaned.substring(0, 100) + "..." : cleaned;
}

export function formatContentType(contentType) {
  if (!contentType) return "";
  return contentType.toUpperCase();
}

export function formatConceptTags(conceptTags) {
  if (!conceptTags || !Array.isArray(conceptTags)) return "";
  return conceptTags.join(", ");
}

export function formatExtractionConfidence(confidence) {
  if (!confidence) return "";

  const formatScore = (score) => {
    const percent = Math.round(score * 100);
    const bar = "█".repeat(Math.floor(percent / 10)) + "░".repeat(10 - Math.floor(percent / 10));
    return `${bar} ${percent}%`;
  };

  let result = [];
  if (confidence.summary !== undefined) result.push(`Summary: ${formatScore(confidence.summary)}`);
  if (confidence.tags !== undefined) result.push(`Tags: ${formatScore(confidence.tags)}`);
  if (confidence.relationships !== undefined) result.push(`Relations: ${formatScore(confidence.relationships)}`);

  return result.join("\n");
}

export async function displayScrapJson(scrap_id) {
  const tableName = config.database?.table || "scraps";

  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("scrap_id", scrap_id)
      .single();

    if (error) throw error;

    if (data) {
      // Remove all embedding fields and other technical fields
      delete data.embedding;
      delete data.embedding_nomic;
      delete data.image_embedding;
      delete data.processing_instance_id;
      delete data.processing_started_at;

      // This console.log is intentional - it's the output for the json command
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`No scrap found with ID: ${scrap_id}`);
    }
  } catch (error) {
    // Output error message for CLI user
    console.error(`Error fetching scrap: ${error.message}`);
  }
}
