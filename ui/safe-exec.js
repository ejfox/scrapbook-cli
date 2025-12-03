import { spawn } from "child_process";
import { format } from "date-fns";

/**
 * Launch fzf with bookmark data and return selected index
 * @param {Array} bookmarks - Array of bookmarks to search through
 * @param {Object} screen - Blessed screen to suspend/resume
 * @returns {Promise<number|null>} Index of selected bookmark or null if cancelled
 */
export function launchFzf(bookmarks, screen) {
  return new Promise((resolve) => {
    // Suspend the blessed screen to give control to fzf
    screen.leave();

    // Format bookmarks for fzf display
    // Use tab-separated format: INDEX\tDISPLAY_LINE
    const fzfLines = bookmarks.map((bookmark, idx) => {
      const date = format(new Date(bookmark.created_at), "MM/dd/yy");
      const source = bookmark.source || bookmark.content_type || "?";

      // Get content preview
      let content = "";
      if (bookmark.meta_summary && bookmark.meta_summary !== "No summary available") {
        content = bookmark.meta_summary;
      } else if (bookmark.title && bookmark.title !== "[no title]") {
        content = bookmark.title;
      } else if (bookmark.content) {
        content = bookmark.content.substring(0, 100);
      }

      // Clean content for display - remove tabs and newlines
      content = content.replace(/[\t\n]/g, " ").substring(0, 80);

      // Format: INDEX\tDATE | SOURCE | CONTENT (tab-separated for easy parsing)
      const displayLine = `${date} │ ${source.padEnd(10)} │ ${content}`;
      return `${idx}\t${displayLine}`;
    });

    const fzfInput = fzfLines.join("\n");

    // Spawn fzf with --delimiter and --with-nth to show only the display part
    const fzf = spawn("fzf", [
      "--ansi",
      "--prompt=Search bookmarks > ",
      "--height=100%",
      "--reverse",
      "--border",
      "--info=inline",
      "--delimiter=\t",
      "--with-nth=2..",  // Only show fields after the first tab (hide index)
    ], {
      stdio: ["pipe", "pipe", "inherit"],
    });

    let output = "";

    fzf.stdout.on("data", (data) => {
      output += data.toString();
    });

    fzf.on("error", (err) => {
      screen.enter();
      screen.render();
      resolve(null);
    });

    fzf.on("close", (code) => {
      // Resume blessed screen
      screen.enter();
      screen.render();

      if (code === 0 && output.trim()) {
        // Extract index by splitting on tab - first field is the index
        const parts = output.trim().split("\t");
        if (parts.length > 0) {
          const index = parseInt(parts[0], 10);
          if (!isNaN(index)) {
            resolve(index);
            return;
          }
        }
        resolve(null);
      } else {
        // User cancelled (ESC) or no selection
        resolve(null);
      }
    });

    // Write bookmark data to fzf stdin
    fzf.stdin.write(fzfInput);
    fzf.stdin.end();
  });
}

/**
 * Safely open a URL in the default browser
 * @param {string} url - The URL to open
 * @returns {Promise<void>}
 */
export function openUrl(url) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== "string") {
      reject(new Error("Invalid URL"));
      return;
    }

    // Detect platform
    const platform = process.platform;
    let command;
    let args;

    if (platform === "darwin") {
      command = "open";
      args = [url];
    } else if (platform === "win32") {
      command = "cmd.exe";
      args = ["/c", "start", '""', url];
    } else {
      // Linux
      command = "xdg-open";
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", reject);
    child.unref();
    resolve();
  });
}

/**
 * Open scrap content in external editor (nvim/vim/etc)
 * @param {Object} scrap - The scrap to edit
 * @param {Object} screen - Blessed screen to suspend/resume
 * @returns {Promise<void>}
 */
export function openInEditor(scrap, screen) {
  return new Promise((resolve, reject) => {
    import('fs').then(fs => {
      import('os').then(os => {
        import('path').then(path => {
          // Get editor from environment or fallback
          const editor = process.env.EDITOR || process.env.VISUAL || 'nvim';

          // Create temp file with scrap content
          const tmpDir = os.tmpdir();
          const tmpFile = path.join(tmpDir, `scrapbook-${scrap.scrap_id}.md`);

          // Format scrap content as markdown with ALL data
          const sections = [
            `# ${scrap.title || '[no title]'}`,
            '',
            '## Metadata',
            '',
            `**Scrap ID:** ${scrap.scrap_id || 'N/A'}`,
            `**UUID:** ${scrap.id || 'N/A'}`,
            `**URL:** ${scrap.url || 'N/A'}`,
            `**Public URL:** ${scrap.public_url || 'N/A'}`,
            `**Source:** ${scrap.source || 'N/A'}`,
            `**Type:** ${scrap.type || 'N/A'}`,
            `**Content Type:** ${scrap.content_type || 'N/A'}`,
            `**Created:** ${scrap.created_at || 'N/A'}`,
            `**Updated:** ${scrap.updated_at || 'N/A'}`,
            `**Published:** ${scrap.published_at || 'N/A'}`,
            `**Shared:** ${scrap.shared ? 'Yes' : 'No'}`,
            '',
            '### Processing Info',
            '',
            `**Graph Imported:** ${scrap.graph_imported ? 'Yes' : 'No'}`,
            `**Processing Instance:** ${scrap.processing_instance_id || 'N/A'}`,
            `**Processing Started:** ${scrap.processing_started_at || 'N/A'}`,
            '',
          ];

          // Tags
          if (scrap.tags && scrap.tags.length > 0) {
            sections.push('## Tags', '', scrap.tags.map(t => `- ${t}`).join('\n'), '');
          }

          // Concept Tags
          if (scrap.concept_tags && scrap.concept_tags.length > 0) {
            sections.push('## Concept Tags', '', scrap.concept_tags.map(t => `- ${t}`).join('\n'), '');
          }

          // Location
          if (scrap.location || scrap.latitude || scrap.longitude) {
            sections.push('## Location', '');
            if (scrap.location) sections.push(`**Place:** ${scrap.location}`);
            if (scrap.latitude && scrap.longitude) {
              sections.push(`**Coordinates:** ${scrap.latitude}, ${scrap.longitude}`);
              sections.push(`**Map:** https://www.openstreetmap.org/?mlat=${scrap.latitude}&mlon=${scrap.longitude}&zoom=12`);
            }
            sections.push('');
          }

          // Summary
          sections.push('## Summary', '', scrap.summary || 'No summary available', '');

          // Relationships
          if (scrap.relationships && scrap.relationships.length > 0) {
            sections.push('## Relationships', '');
            scrap.relationships.forEach(rel => {
              const source = rel.source || '[unknown]';
              const relationship = rel.relationship || '[unknown relationship]';
              const target = rel.target || '[unknown]';
              sections.push(`- **${source}** ${relationship} **${target}**`);
            });
            sections.push('');
          }

          // Financial Analysis
          if (scrap.financial_analysis) {
            sections.push('## Financial Analysis', '', '```json', JSON.stringify(scrap.financial_analysis, null, 2), '```', '');
          }

          // Extraction Confidence
          if (scrap.extraction_confidence) {
            sections.push('## Extraction Confidence', '', '```json', JSON.stringify(scrap.extraction_confidence, null, 2), '```', '');
          }

          // Metadata (original source metadata)
          if (scrap.metadata) {
            sections.push('## Source Metadata', '', '```json', JSON.stringify(scrap.metadata, null, 2), '```', '');
          }

          // Screenshot
          if (scrap.screenshot_url) {
            sections.push('## Screenshot', '', `![Screenshot](${scrap.screenshot_url})`, '');
          }

          // Main Content (at the end so it doesn't push other data down)
          sections.push('---', '', '## Full Content', '', scrap.content || 'No content available');

          const content = sections.join('\n');

          // Write temp file
          fs.writeFileSync(tmpFile, content);

          // Suspend blessed screen
          screen.leave();

          // Spawn editor
          const editorProcess = spawn(editor, [tmpFile], {
            stdio: 'inherit'
          });

          editorProcess.on('error', (err) => {
            screen.enter();
            screen.render();
            reject(err);
          });

          editorProcess.on('close', (code) => {
            // Resume blessed screen
            screen.enter();
            screen.render();

            // Clean up temp file
            try {
              fs.unlinkSync(tmpFile);
            } catch (e) {
              // Ignore cleanup errors
            }

            resolve();
          });
        });
      });
    });
  });
}

/**
 * Safely copy text to clipboard
 * @param {string} text - The text to copy
 * @returns {Promise<void>}
 */
export function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    if (!text || typeof text !== "string") {
      reject(new Error("Invalid text"));
      return;
    }

    const platform = process.platform;
    let command;
    let args;

    if (platform === "darwin") {
      command = "pbcopy";
      args = [];
    } else if (platform === "win32") {
      command = "clip";
      args = [];
    } else {
      // Linux - try xclip first, then xsel
      command = "xclip";
      args = ["-selection", "clipboard"];
    }

    const child = spawn(command, args);

    child.on("error", (err) => {
      if (platform === "linux" && command === "xclip") {
        // Fallback to xsel on Linux if xclip fails
        const fallbackChild = spawn("xsel", ["--clipboard", "--input"]);
        fallbackChild.on("error", reject);
        fallbackChild.stdin.write(text);
        fallbackChild.stdin.end();
        fallbackChild.on("close", resolve);
      } else {
        reject(err);
      }
    });

    child.on("close", resolve);

    // Write the text to stdin
    child.stdin.write(text);
    child.stdin.end();
  });
}
