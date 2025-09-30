import blessed from "blessed";
import contrib from "blessed-contrib";
import { stripMarkdown, formatTags, formatLocation, formatFinancialAnalysis, formatRelationships } from "../data.js";

export function createMapView(bookmarks) {
  const screen = blessed.screen({
    smartCSR: true,
    title: "ejfox.com/scrapbook Map View",
  });

  // Ensure we have valid terminal dimensions
  const terminalWidth = process.stdout.columns || 80;
  const terminalHeight = process.stdout.rows || 24;
  const cols = Math.min(16, Math.max(8, Math.floor(terminalWidth / 5)));

  const grid = new contrib.grid({ rows: 12, cols: cols, screen: screen });
  const mapCols = Math.max(8, cols - 4);
  const infoCols = Math.min(4, cols - mapCols);

  const map = grid.set(0, 0, 12, mapCols, contrib.map, {
    label: "Scrapbook Map",
  });

  const infoBox = grid.set(0, mapCols, 12, infoCols, blessed.box, {
    label: "Bookmark Info",
    content: "Select a marker to view bookmark info",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    scrollbar: {
      ch: " ",
      inverse: true,
    },
  });

  // Filter bookmarks with location data - check top-level lat/lng fields
  const markers = bookmarks
    .filter((bookmark) => {
      // Check top-level latitude/longitude first
      if (bookmark.latitude && bookmark.longitude) {
        return true;
      }
      // Check if location field has coordinates
      if (bookmark.location) {
        try {
          const locationObj = typeof bookmark.location === 'string'
            ? JSON.parse(bookmark.location)
            : bookmark.location;
          return locationObj.latitude && locationObj.longitude;
        } catch (e) {
          return false;
        }
      }
      return false;
    })
    .map((bookmark, index) => {
      let lat, lon;

      // Get coordinates from top-level fields first
      if (bookmark.latitude && bookmark.longitude) {
        lat = bookmark.latitude;
        lon = bookmark.longitude;
      } else if (bookmark.location) {
        // Try to parse from location field
        try {
          const locationObj = typeof bookmark.location === 'string'
            ? JSON.parse(bookmark.location)
            : bookmark.location;
          lat = locationObj.latitude;
          lon = locationObj.longitude;
        } catch (e) {
          return null;
        }
      }

      return {
        lon: lon,
        lat: lat,
        color: "green",
        char: "•",
        label: bookmark.scrap_id || bookmark.id,
        bookmarkData: bookmark,
        index: index,
      };
    })
    .filter(Boolean); // Remove null entries

  // Add markers to map
  markers.forEach((marker) => map.addMarker(marker));

  // Initialize state
  let selectedMarkerIndex = markers.length > 0 ? 0 : -1;

  // Show initial info
  if (markers.length > 0) {
    showBookmarkInfo(markers[0].bookmarkData);
    infoBox.setContent(
      `Found ${markers.length} bookmarks with location data\n\n` +
      infoBox.getContent()
    );
  } else {
    infoBox.setContent(
      `No bookmarks found with location data.\n\n` +
      `Total bookmarks: ${bookmarks.length}\n` +
      `Need latitude/longitude coordinates to display on map.`
    );
  }

  function showBookmarkInfo(bookmark) {
    const rawContent = bookmark.content || bookmark.title || bookmark.url || "No content";
    const content = stripMarkdown(rawContent);
    const source = bookmark.source || "Unknown";
    const tags = formatTags(bookmark.tags);
    const location = formatLocation(bookmark.location);
    const financial = formatFinancialAnalysis(bookmark.financial_analysis);
    const relationships = formatRelationships(bookmark.relationships);

    let info = `Source: ${source}\n\n`;
    info += `Content: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n\n`;

    if (tags) info += `Tags: ${tags}\n\n`;
    if (location) info += `Location: ${location}\n\n`;
    if (financial) info += `Financial: ${financial}\n\n`;
    if (relationships) info += `Relationships: ${relationships}\n\n`;

    info += `Coordinates: ${bookmark.latitude}, ${bookmark.longitude}`;

    infoBox.setContent(info);
  }

  screen.key(["q", "C-c"], () => process.exit(0));
  screen.key(["up"], () => {
    if (selectedMarkerIndex > 0) {
      selectedMarkerIndex--;
      showBookmarkInfo(markers[selectedMarkerIndex].bookmarkData);
      screen.render();
    }
  });
  screen.key(["down"], () => {
    if (selectedMarkerIndex < markers.length - 1) {
      selectedMarkerIndex++;
      showBookmarkInfo(markers[selectedMarkerIndex].bookmarkData);
      screen.render();
    }
  });

  screen.render();
}