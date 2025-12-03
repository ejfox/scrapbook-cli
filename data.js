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
  console.error(
    "Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_KEY in environment or config."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function loadBookmarks() {
  const tableName = config.database?.table || "scraps";
  const orderBy = config.database?.order_by || "created_at";
  const orderDirection = config.database?.order_direction || "desc";
  const limit = config.database?.default_limit || 500;

  // Only fetch fields we actually use - exclude heavy embedding fields
  const selectFields = config.database?.default_select ||
    "scrap_id,id,created_at,updated_at,source,content,url,title,tags,summary,meta_summary,relationships,location,latitude,longitude,metadata,content_type,published_at,financial_analysis";

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
    public_url: `https://ejfox.com/scrapbook/${bookmark.scrap_id || bookmark.id}`,
  }));
}

export function createColorScale(_bookmarks) {
  return d3.scaleOrdinal(COLOR_PALETTE);
}

export function formatTableData(bookmarks) {
  return {
    headers: ["DATE", "SRC", "CONTENT"],
    data: bookmarks.map((bookmark) => {
      const row = ["date", "src", "content"].map((header) => {
        if (header === "date") {
          // Just show MM/dd, more compact
          return format(new Date(bookmark.created_at), "MM/dd");
        } else if (header === "src") {
          // Source icon + metadata count
          const indicators = {
            pinboard: "", // nf-fa-bookmark
            arena: "", // nf-fa-palette
            github: "", // nf-fa-github
            mastodon: "", // nf-fa-at
            news: "", // nf-fa-newspaper
            article: "", // nf-fa-file_text
            video: "", // nf-fa-play_circle
            image: "", // nf-fa-image
            note: "", // nf-fa-sticky_note
            bookmark: "", // nf-fa-link
          };

          const type = bookmark.content_type || bookmark.source || "?";
          const icon = indicators[type.toLowerCase()] || indicators[bookmark.source?.toLowerCase()] || "•";

          // Count total metadata
          const tagCount = bookmark.tags?.length || 0;
          const relCount = bookmark.relationships?.length || 0;
          const totalMeta = tagCount + relCount;

          // Show metadata count compactly
          const metaStr = totalMeta > 0 ? ` ${totalMeta}` : "";
          return `${icon}${metaStr}`;
        } else if (header === "content") {
          // Build information-dense content string
          const parts = [];

          // 1. Location first if available (most contextual)
          // Parse location if it's JSON string
          let location = bookmark.location;
          if (location && location.startsWith("{")) {
            try {
              const locObj = JSON.parse(location);
              location = locObj.location;
            } catch (e) {
              location = null;
            }
          }

          if (location && location !== "Unknown" && location !== null) {
            const loc = location.length > 20
              ? location.substring(0, 18) + "…"
              : location;
            parts.push(`${loc}`);
          }

          // 2. Main content: prefer meta_summary, fallback intelligently
          let mainContent = "";
          if (bookmark.meta_summary && bookmark.meta_summary !== "No summary available") {
            mainContent = bookmark.meta_summary;
          } else if (bookmark.title && bookmark.title !== "[no title]") {
            mainContent = stripMarkdown(bookmark.title);
          } else if (bookmark.content && bookmark.content.trim()) {
            // Show content snippet instead of "[no title]"
            const snippet = stripMarkdown(bookmark.content).trim();
            mainContent = snippet.length > 80 ? snippet.substring(0, 77) + "…" : snippet;
          } else if (bookmark.url) {
            // Extract domain from URL for cleaner display
            try {
              const urlObj = new URL(bookmark.url);
              mainContent = urlObj.hostname.replace(/^www\./, '') + urlObj.pathname.substring(0, 30);
            } catch {
              mainContent = bookmark.url.substring(0, 50);
            }
          } else {
            mainContent = "[empty]";
          }

          // Truncate main content to leave room for location
          const remainingSpace = parts.length > 0 ? 90 : 120;
          if (mainContent.length > remainingSpace) {
            mainContent = mainContent.substring(0, remainingSpace - 1) + "…";
          }

          if (mainContent) {
            parts.push(mainContent);
          }

          // Join with separator
          return parts.join(" · ");
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
  const orderBy = config.database?.order_by || "created_at";
  const orderDirection = config.database?.order_direction || "desc";

  // Use the same optimized field selection as loadBookmarks
  const selectFields = config.database?.default_select ||
    "scrap_id,id,created_at,updated_at,source,content,url,title,tags,summary,meta_summary,relationships,location,latitude,longitude,metadata,content_type,published_at,financial_analysis";

  // Build case-insensitive pattern search across multiple columns
  // This is more reliable for simple keyword searches than full-text search
  const searchPattern = `%${query}%`;

  // Build OR query for all search columns
  let queryBuilder = supabase
    .from(tableName)
    .select(selectFields);

  // Add .or() condition for each search column with case-insensitive ILIKE
  const orConditions = searchColumns.map(col => `${col}.ilike.${searchPattern}`).join(',');
  queryBuilder = queryBuilder.or(orConditions);

  const { data, error } = await queryBuilder
    .order(orderBy, { ascending: orderDirection === "asc" });

  if (error) {
    throw new Error(`Error searching bookmarks: ${error.message}`);
  }

  return data.map((bookmark) => ({
    ...bookmark,
    public_url: `https://ejfox.com/scrapbook/${bookmark.scrap_id || bookmark.id}`,
  }));
}

// Schema-aware formatting functions
export function formatRelationships(relationships) {
  if (!relationships || !Array.isArray(relationships)) return "";

  return relationships
    .map((rel) => {
      const source = rel.source?.name || rel.source;
      const target = rel.target?.name || rel.target;
      const type = rel.type || rel.relationship;
      return `${source} ${type} ${target}`;
    })
    .join(", ");
}

export function formatLocation(location) {
  if (!location) return "";

  // Location is now a simple string like "New York, USA" or "Unknown"
  if (typeof location === "string") {
    return location;
  }

  // Legacy support: handle old JSON format if encountered
  if (typeof location === "object") {
    const main = location.location || location.city || "";
    const country = location.country || "";
    return country ? `${main}, ${country}` : main;
  }

  return String(location);
}

export function formatFinancialAnalysis(financial) {
  if (!financial) return "";

  const tracked = financial.tracked_assets?.map((asset) => asset.symbol).join(", ") || "";
  const discovered = financial.discovered_assets?.map((asset) => asset.name).join(", ") || "";
  const sentiment = financial.overall_market_sentiment;

  const result = [];
  if (tracked) result.push(`Tracked: ${tracked}`);
  if (discovered) result.push(`Discovered: ${discovered}`);
  if (sentiment !== undefined) result.push(`Sentiment: ${sentiment > 0 ? "+" : ""}${sentiment}`);

  return result.join(" | ");
}

export function formatTags(tags) {
  if (!tags) return "";
  if (Array.isArray(tags)) return tags.join(", ");
  return tags;
}

export function stripMarkdown(text) {
  if (!text) return "";

  return (
    text
      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
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
      .trim()
  );
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

  const result = [];
  if (confidence.summary !== undefined) result.push(`Summary: ${formatScore(confidence.summary)}`);
  if (confidence.tags !== undefined) result.push(`Tags: ${formatScore(confidence.tags)}`);
  if (confidence.relationships !== undefined)
    {result.push(`Relations: ${formatScore(confidence.relationships)}`);}

  return result.join("\n");
}

/**
 * Generate a META-summary: a ~140 character synthesis of all analysis outputs
 * This combines insights from summary, tags, relationships, location, etc.
 * into a compact, Twitter-length overview of the scrap.
 */
export function generateMetaSummary(scrap) {
  const parts = [];
  const maxLength = 140;

  // Start with content type if available
  if (scrap.content_type && scrap.content_type !== "bookmark") {
    parts.push(scrap.content_type.toUpperCase());
  }

  // Add primary subject from title or first concept tag
  if (scrap.title) {
    const title = stripMarkdown(scrap.title).substring(0, 40);
    parts.push(title);
  } else if (scrap.concept_tags && scrap.concept_tags.length > 0) {
    parts.push(scrap.concept_tags[0]);
  }

  // Add location if notable
  if (scrap.location && scrap.location !== "Unknown") {
    parts.push(`@ ${scrap.location}`);
  }

  // Add relationship count if significant
  if (scrap.relationships && scrap.relationships.length > 0) {
    parts.push(`${scrap.relationships.length} connections`);
  }

  // Add financial context if present
  if (scrap.financial_analysis?.tracked_assets?.length > 0) {
    const symbols = scrap.financial_analysis.tracked_assets.map((a) => a.symbol).join(",");
    parts.push(`$${symbols}`);
  }

  // Add key tags (max 2-3)
  const keyTags = [];
  if (scrap.tags && Array.isArray(scrap.tags)) {
    keyTags.push(...scrap.tags.slice(0, 2));
  } else if (scrap.concept_tags && Array.isArray(scrap.concept_tags)) {
    keyTags.push(...scrap.concept_tags.slice(0, 2));
  }
  if (keyTags.length > 0) {
    parts.push(`#${keyTags.join(" #")}`);
  }

  // Combine parts and truncate to max length
  let summary = parts.join(" · ");

  // If we have room and a summary exists, add a snippet
  if (summary.length < maxLength - 20 && scrap.summary) {
    const cleanSummary = stripMarkdown(scrap.summary).replace(/\n/g, " ").trim();
    const remainingSpace = maxLength - summary.length - 3; // -3 for " - "
    if (remainingSpace > 20) {
      const snippet = cleanSummary.substring(0, remainingSpace);
      summary += ` - ${snippet}`;
    }
  }

  // Final truncation
  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength - 1) + "…";
  }

  return summary || "No summary available";
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
