import blessed from "blessed";
import { stripMarkdown, formatTags } from "../database.js";

export function createForceLayoutView(
  bookmarks,
  parentScreen,
  focusBookmark = null,
  onClose = null
) {
  const title = focusBookmark
    ? `Force Layout - ${focusBookmark.title?.substring(0, 40) || "Current Bookmark"} Relationships`
    : "Scrapbook Force Layout - Relationship Graph";

  // Create a fullscreen container on the parent screen instead of a new screen
  const container = blessed.box({
    parent: parentScreen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    label: title,
    border: "line",
    style: {
      border: { fg: "cyan" },
      bg: "black",
    },
  });

  // Create main graph area as a child of container
  const graphBox = blessed.box({
    parent: container,
    top: 1,
    left: 1,
    width: "98%",
    height: "80%",
    label: "Relationship Force Graph",
    border: "line",
    style: {
      border: { fg: "cyan" },
    },
  });

  // Info panel
  const infoLabel = focusBookmark ? "Bookmark Relationships" : "Node Info";
  const infoBox = blessed.box({
    parent: container,
    bottom: 0,
    left: 1,
    width: "98%",
    height: "18%",
    label: infoLabel,
    content: "Press F to start force simulation\nArrow keys to navigate\nQ or ESC to exit",
    border: "line",
    scrollable: true,
    keys: true,
    vi: true,
    style: {
      border: { fg: "green" },
    },
  });

  // Extract nodes and links from bookmarks with relationships
  const nodes = new Map();
  const links = [];

  // If we have a focus bookmark, start with its relationships
  if (focusBookmark) {
    // Add the focus bookmark as the central node
    const centralNodeId = focusBookmark.scrap_id || focusBookmark.id;
    nodes.set(centralNodeId, {
      id: centralNodeId,
      name: focusBookmark.title || focusBookmark.content?.substring(0, 30) || centralNodeId,
      source: focusBookmark.source,
      bookmark: focusBookmark,
      x: 40, // Center it
      y: 12,
      vx: 0,
      vy: 0,
      isCentral: true,
    });

    // Add relationships from the focus bookmark
    if (focusBookmark.relationships && Array.isArray(focusBookmark.relationships)) {
      focusBookmark.relationships.forEach((rel) => {
        // Skip empty relationship objects
        if (!rel || typeof rel !== "object" || Object.keys(rel).length === 0) return;

        // Handle both old and new schema formats
        const targetName = rel.target?.name || rel.target;
        const relType = rel.type || rel.relationship || "RELATED_TO";

        // Skip if no valid target name
        if (!targetName) return;

        // Create target node
        const targetId = `node_${String(targetName).replace(/\s+/g, "_")}`;
        if (!nodes.has(targetId)) {
          nodes.set(targetId, {
            id: targetId,
            name: String(targetName),
            source: "relationship",
            x: Math.random() * 60 + 5,
            y: Math.random() * 20 + 2,
            vx: 0,
            vy: 0,
          });
        }

        links.push({
          source: centralNodeId,
          target: targetId,
          type: relType,
        });
      });
    }
  } else {
    // Fallback: add all bookmarks as potential nodes (original behavior)
    bookmarks.forEach((bookmark) => {
      const nodeId = bookmark.scrap_id || bookmark.id;
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          name: bookmark.title || bookmark.content?.substring(0, 30) || nodeId,
          source: bookmark.source,
          bookmark: bookmark,
          x: Math.random() * 60 + 5,
          y: Math.random() * 20 + 2,
          vx: 0,
          vy: 0,
        });
      }
    });

    // Add relationships as links (original behavior)
    bookmarks.forEach((bookmark) => {
      if (bookmark.relationships && Array.isArray(bookmark.relationships)) {
        bookmark.relationships.forEach((rel) => {
          // Skip empty relationship objects
          if (!rel || typeof rel !== "object" || Object.keys(rel).length === 0) return;

          const sourceId = bookmark.scrap_id || bookmark.id;
          const targetName = rel.target?.name || rel.target;
          const relType = rel.type || rel.relationship || "RELATED_TO";

          if (!targetName) return;

          // Find or create target node
          let targetId = null;
          for (const [id, node] of nodes) {
            if (node.name.includes(targetName) || node.id === targetName) {
              targetId = id;
              break;
            }
          }

          if (!targetId) {
            targetId = `node_${String(targetName).replace(/\s+/g, "_")}`;
            nodes.set(targetId, {
              id: targetId,
              name: String(targetName),
              source: "relationship",
              x: Math.random() * 60 + 5,
              y: Math.random() * 20 + 2,
              vx: 0,
              vy: 0,
            });
          }

          links.push({
            source: sourceId,
            target: targetId,
            type: relType,
          });
        });
      }
    });
  }

  const nodeArray = Array.from(nodes.values());

  let animationRunning = false;
  let selectedNodeIndex = 0;

  function renderGraph() {
    const width = graphBox.width - 2;
    const height = graphBox.height - 2;

    // Create ASCII canvas
    const canvas = Array(height)
      .fill()
      .map(() => Array(width).fill(" "));

    // Draw links
    links.forEach((link) => {
      const sourceNode = nodes.get(link.source);
      const targetNode = nodes.get(link.target);

      if (sourceNode && targetNode) {
        drawLine(
          canvas,
          Math.floor(sourceNode.x),
          Math.floor(sourceNode.y),
          Math.floor(targetNode.x),
          Math.floor(targetNode.y),
          "-"
        );
      }
    });

    // Draw nodes
    nodeArray.forEach((node, index) => {
      const x = Math.floor(node.x);
      const y = Math.floor(node.y);

      if (x >= 0 && x < width && y >= 0 && y < height) {
        let char;
        if (node.isCentral) {
          char = "◆"; // Diamond for central node
        } else if (index === selectedNodeIndex) {
          char = "●"; // Filled circle for selected
        } else {
          char = "○"; // Empty circle for others
        }
        canvas[y][x] = char;

        // Add node label
        const label = node.name.substring(0, 8);
        for (let i = 0; i < label.length && x + i + 1 < width; i++) {
          canvas[y][x + i + 1] = label[i];
        }
      }
    });

    // Convert canvas to string
    const content = canvas.map((row) => row.join("")).join("\n");
    graphBox.setContent(content);
  }

  function drawLine(canvas, x0, y0, x1, y1, char) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let x = x0,
      y = y0;

    while (true) {
      if (x >= 0 && x < canvas[0].length && y >= 0 && y < canvas.length) {
        if (canvas[y][x] === " ") canvas[y][x] = char;
      }

      if (x === x1 && y === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  function updateForces() {
    const width = graphBox.width - 2;
    const height = graphBox.height - 2;

    // Apply forces
    nodeArray.forEach((node) => {
      // Center force
      const centerX = width / 2;
      const centerY = height / 2;
      node.vx += (centerX - node.x) * 0.001;
      node.vy += (centerY - node.y) * 0.001;

      // Repulsion between nodes
      nodeArray.forEach((other) => {
        if (node !== other) {
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const force = 5 / (distance * distance);
          node.vx += (dx / distance) * force;
          node.vy += (dy / distance) * force;
        }
      });
    });

    // Apply link forces
    links.forEach((link) => {
      const sourceNode = nodes.get(link.source);
      const targetNode = nodes.get(link.target);

      if (sourceNode && targetNode) {
        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const distance = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const targetDistance = 10;
        const force = (distance - targetDistance) * 0.1;

        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        sourceNode.vx += fx;
        sourceNode.vy += fy;
        targetNode.vx -= fx;
        targetNode.vy -= fy;
      }
    });

    // Update positions and apply damping
    nodeArray.forEach((node) => {
      node.vx *= 0.9; // damping
      node.vy *= 0.9;

      node.x += node.vx;
      node.y += node.vy;

      // Keep within bounds
      node.x = Math.max(1, Math.min(width - 10, node.x));
      node.y = Math.max(1, Math.min(height - 2, node.y));
    });
  }

  function showNodeInfo(node) {
    let info = `Node: ${node.name}\n\n`;
    info += `Source: ${node.source}\n`;
    info += `Position: (${Math.floor(node.x)}, ${Math.floor(node.y)})\n\n`;

    if (node.bookmark) {
      const bookmark = node.bookmark;
      const rawContent = bookmark.content || bookmark.title || "";
      const cleanContent = stripMarkdown(rawContent);
      info += `Content: ${cleanContent.substring(0, 100)}\n\n`;
      if (bookmark.tags) {
        info += `Tags: ${formatTags(bookmark.tags)}\n\n`;
      }
    }

    // Show connections
    const connections = links.filter((l) => l.source === node.id || l.target === node.id);
    if (connections.length > 0) {
      info += `Connections (${connections.length}): \n`;
      connections.slice(0, 5).forEach((conn) => {
        const other = conn.source === node.id ? conn.target : conn.source;
        const otherNode = nodes.get(other);
        info += `  ${conn.type} ${otherNode?.name || other}\n`;
      });
      if (connections.length > 5) {
        info += `  ... and ${connections.length - 5} more\n`;
      }
    }

    infoBox.setContent(info);
  }

  // Initial render
  renderGraph();
  if (nodeArray.length > 0) {
    showNodeInfo(nodeArray[0]);
    if (focusBookmark) {
      const relationshipCount = links.length;
      infoBox.setContent(
        `Viewing relationships for:\n${focusBookmark.title?.substring(0, 50) || "Current bookmark"}\n\n` +
          `◆ Central node\n○ Related entities\n● Selected node\n\n` +
          `Relationships: ${relationshipCount}\n\n` +
          infoBox.getContent()
      );
    }
  }

  // Animation loop
  let animationInterval;

  function startAnimation() {
    if (animationRunning) return;
    animationRunning = true;

    animationInterval = setInterval(() => {
      updateForces();
      renderGraph();
      parentScreen.render();
    }, 100);

    infoBox.setContent(
      `Force simulation running...\n\nNodes: ${nodeArray.length}\nLinks: ${links.length}\n\n${infoBox.getContent()}`
    );
  }

  function stopAnimation() {
    if (animationInterval) {
      clearInterval(animationInterval);
      animationInterval = null;
    }
    animationRunning = false;
  }

  // Keyboard controls
  container.key(["q", "escape"], () => {
    stopAnimation();
    parentScreen.remove(container);
    if (onClose) onClose();
    parentScreen.render();
  });

  container.key(["f"], () => {
    if (animationRunning) {
      stopAnimation();
      infoBox.setContent(`Animation stopped\n\n${infoBox.getContent()}`);
    } else {
      startAnimation();
    }
    parentScreen.render();
  });

  container.key(["up"], () => {
    if (nodeArray.length > 0) {
      selectedNodeIndex = (selectedNodeIndex - 1 + nodeArray.length) % nodeArray.length;
      showNodeInfo(nodeArray[selectedNodeIndex]);
      renderGraph();
      parentScreen.render();
    }
  });

  container.key(["down"], () => {
    if (nodeArray.length > 0) {
      selectedNodeIndex = (selectedNodeIndex + 1) % nodeArray.length;
      showNodeInfo(nodeArray[selectedNodeIndex]);
      renderGraph();
      parentScreen.render();
    }
  });

  container.key(["space"], () => {
    // Randomize positions for new layout
    nodeArray.forEach((node) => {
      node.x = Math.random() * (graphBox.width - 12) + 5;
      node.y = Math.random() * (graphBox.height - 4) + 2;
      node.vx = 0;
      node.vy = 0;
    });
    renderGraph();
    parentScreen.render();
  });

  // Focus the container and render
  container.focus();
  parentScreen.render();

  // Auto-start if there are relationships
  if (links.length > 0) {
    setTimeout(startAnimation, 1000);
  } else {
    if (focusBookmark) {
      infoBox.setContent(
        `No relationships found in this bookmark.\n\n` +
          `Bookmark: ${focusBookmark.title?.substring(0, 50) || "Current bookmark"}\n\n` +
          `This bookmark doesn't have relationship data to visualize.`
      );
    } else {
      infoBox.setContent(
        `No relationships found in bookmarks.\n\nTotal bookmarks: ${bookmarks.length}\n\nNeed 'relationships' field with graph data.`
      );
    }
  }
}
