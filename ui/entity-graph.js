/**
 * Entity Graph Explorer - Interactive d3-force visualization for exploring entity relationships
 *
 * This module provides a "hacker mode" TUI for dynamically exploring knowledge graphs.
 * Users can navigate entities, expand networks, and discover connections in real-time.
 *
 * Features:
 * - d3-force physics simulation for natural node layout
 * - Dynamic network expansion (add nodes/links without restart)
 * - Status bar showing network metrics (depth, size, expanded entities)
 * - Recursive exploration (dive into any entity)
 * - Connection list with expansion indicators
 * - Scrap listing for each entity
 *
 * @module ui/entity-graph
 */

import blessed from "blessed";
import * as d3 from "d3";

/**
 * Create and launch the interactive entity graph explorer TUI
 *
 * @param {Object} entityData - Entity query result from queryByEntity()
 * @param {string} entityData.query - The entity name being queried
 * @param {number} entityData.total_scraps - Number of scraps mentioning this entity
 * @param {Array} entityData.scraps - Array of scrap objects
 * @param {Array} entityData.connections - Array of connection objects
 * @param {Object} entityData.graph - Graph structure with nodes and edges
 * @param {Array} entityData.graph.nodes - Array of node objects
 * @param {Array} entityData.graph.edges - Array of edge objects
 * @param {string} entityName - The entity name (used for display)
 */
export function createEntityGraphView(entityData, entityName) {
  const screen = blessed.screen({
    smartCSR: true,
    title: `Entity Graph: ${entityName}`,
  });

  // Main graph area
  const graphBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "70%",
    height: "100%-6",
    label: ` Entity: ${entityName} [${entityData.total_scraps} scraps] `,
    border: "line",
    style: {
      border: { fg: "#ff1a90" }, // Vulpes pink
    },
  });

  // Side panel for node details
  const detailsBox = blessed.box({
    parent: screen,
    top: 0,
    right: 0,
    width: "30%",
    height: "70%",
    label: " Details ",
    border: "line",
    scrollable: true,
    keys: true,
    vi: true,
    style: {
      border: { fg: "#595959" }, // Vulpes gray
    },
  });

  // Connection list at bottom right
  const connectionsBox = blessed.list({
    parent: screen,
    top: "70%",
    right: 0,
    width: "30%",
    height: "30%",
    label: " Connections ",
    border: "line",
    scrollable: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      border: { fg: "#595959" },
      selected: { bg: "#ff1a90", fg: "black" },
    },
  });

  // Status bar showing network stats
  const statusBar = blessed.box({
    parent: screen,
    bottom: 3,
    left: 0,
    width: "70%",
    height: 3,
    tags: true,
    style: {
      border: { fg: "#595959" },
    },
  });

  // Help text at bottom
  const helpText = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "70%",
    height: 3,
    content: "{center}{#595959-fg}[SPACE] Pause  [↑↓] Nav  [ENTER] Explore  [E] Expand  [L] List scraps  [+] Add depth  [Q] Quit{/}",
    tags: true,
  });

  // =============================================================================
  // GRAPH DATA & SIMULATION SETUP
  // =============================================================================

  const width = graphBox.width - 4;
  const height = graphBox.height - 4;

  // Convert entity graph to d3 format - nodes start at center
  const nodes = entityData.graph.nodes.map((n) => ({
    ...n,
    x: width / 2,
    y: height / 2,
  }));

  // Convert edges to links (d3 will replace source/target strings with node refs)
  const links = entityData.graph.edges.map((e) => ({
    ...e,
    source: e.source,
    target: e.target,
  }));

  // Create d3-force simulation with multiple forces for natural layout
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(15)
    )
    .force("charge", d3.forceManyBody().strength(-30))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collision",
      d3.forceCollide().radius(3)
    )
    .stop();

  // Warm up simulation (300 ticks) for initial stable layout
  for (let i = 0; i < 300; ++i) simulation.tick();

  // =============================================================================
  // STATE MANAGEMENT
  // =============================================================================

  let selectedNodeIndex = 0;                                // Currently selected node index
  let animationRunning = false;                             // Physics animation state
  let animationInterval;                                    // Animation timer handle
  let networkDepth = 1;                                     // Current network depth level
  let expandedEntities = new Set([entityName.toLowerCase()]); // Track expanded entities

  // =============================================================================
  // RENDERING FUNCTIONS
  // =============================================================================

  /**
   * Render the graph to ASCII canvas using blessed
   * Draws links as lines, nodes as symbols (◆ for query, ● for selected, ○ for others)
   */
  function renderGraph() {
    // Get actual rendered dimensions
    const actualWidth = Math.max(10, graphBox.width - 4);
    const actualHeight = Math.max(5, graphBox.height - 4);

    const canvas = Array(actualHeight)
      .fill()
      .map(() => Array(actualWidth).fill(" "));

    // Draw links with relationship types
    links.forEach((link) => {
      const source = typeof link.source === "object" ? link.source : nodes.find((n) => n.id === link.source);
      const target = typeof link.target === "object" ? link.target : nodes.find((n) => n.id === link.target);

      if (source && target) {
        drawLine(
          canvas,
          Math.floor(source.x),
          Math.floor(source.y),
          Math.floor(target.x),
          Math.floor(target.y),
          "─"
        );
      }
    });

    // Draw nodes
    nodes.forEach((node, index) => {
      const x = Math.floor(node.x);
      const y = Math.floor(node.y);

      if (x >= 0 && x < actualWidth && y >= 0 && y < actualHeight) {
        let char;
        if (node.type === "query") {
          char = "{#ff1a90-fg}◆{/}"; // Pink diamond for query entity
        } else if (index === selectedNodeIndex) {
          char = "{#ff1a90-fg}●{/}"; // Pink filled circle for selected
        } else {
          char = "○"; // Empty circle
        }

        // Place character with tag parsing
        const row = canvas[y];
        row[x] = char;

        // Add truncated node label
        const label = node.id.substring(0, 10);
        for (let i = 0; i < label.length && x + i + 1 < actualWidth; i++) {
          row[x + i + 1] = label[i];
        }
      }
    });

    // Convert canvas to string with tag support
    const content = canvas.map((row) => row.join("")).join("\n");
    graphBox.setContent(content);
  }

  /**
   * Draw a line on ASCII canvas using Bresenham's algorithm
   * @param {Array} canvas - 2D array representing the canvas
   * @param {number} x0 - Start x coordinate
   * @param {number} y0 - Start y coordinate
   * @param {number} x1 - End x coordinate
   * @param {number} y1 - End y coordinate
   * @param {string} char - Character to use for line drawing
   */
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

  // =============================================================================
  // UI UPDATE FUNCTIONS
  // =============================================================================

  /**
   * Display detailed information about a node in the details panel
   * Shows entity name, type, mention count, relationships, and sample scraps
   * @param {Object} node - The node to display details for
   */
  function showNodeDetails(node) {
    const connection = entityData.connections.find((c) => c.entity === node.id);

    let details = `{bold}${node.id}{/bold}\n\n`;
    details += `Type: {#595959-fg}${node.type}{/}\n`;
    details += `Mentions: {#ff1a90-fg}${node.count}{/}\n\n`;

    if (connection) {
      details += `{bold}Relationship:{/bold}\n`;
      details += `  ${connection.relationship}\n`;
      details += `  Direction: ${connection.direction === "outgoing" ? "→" : "←"}\n`;
      details += `  Count: ${connection.count}x\n\n`;

      // Show sample scraps
      details += `{bold}Found in scraps:{/bold}\n`;
      connection.scraps.slice(0, 5).forEach((scrapId) => {
        details += `  ${scrapId}\n`;
      });
      if (connection.scraps.length > 5) {
        details += `  ... and ${connection.scraps.length - 5} more\n`;
      }
    }

    detailsBox.setContent(details);
  }

  /**
   * Update the connections list panel with current network state
   * Marks expanded entities with [●] indicator for visual tracking
   * Shows relationship direction (→ outgoing, ← incoming) and count
   */
  function updateConnectionsList() {
    const items = entityData.connections.map((conn) => {
      const arrow = conn.direction === "outgoing" ? "→" : "←";
      const expanded = expandedEntities.has(conn.entity.toLowerCase()) ? "{#ff1a90-fg}[●]{/}" : "   ";
      return `${expanded} ${arrow} ${conn.entity} (${conn.count}x) - ${conn.relationship}`;
    });

    connectionsBox.setItems(items);
  }

  /**
   * Update status bar with current network metrics
   * Displays: node count, link count, depth level, expanded entity count, animation state
   */
  function updateStatusBar() {
    const expanded = expandedEntities.size;
    const total = nodes.length;
    const edges = links.length;

    statusBar.setContent(
      `{center}{#ff1a90-fg}◆{/} Network: ${total} nodes · ${edges} links · ` +
      `Depth: ${networkDepth} · Expanded: ${expanded} · ` +
      `{#595959-fg}${animationRunning ? "▶ Running" : "⏸ Paused"}{/}{/center}`
    );
  }

  /**
   * Start the physics animation loop
   * Ticks the d3-force simulation and re-renders graph every 100ms
   */
  function startAnimation() {
    if (animationRunning) return;
    animationRunning = true;

    animationInterval = setInterval(() => {
      simulation.tick();
      renderGraph();
      screen.render();
    }, 100);
  }

  /**
   * Stop the physics animation loop
   * Clears the animation interval and updates status bar
   */
  function stopAnimation() {
    if (animationInterval) {
      clearInterval(animationInterval);
      animationInterval = null;
    }
    animationRunning = false;
    updateStatusBar();
  }

  /**
   * Expand the network by querying for a specific entity's relationships
   * Dynamically adds new nodes and links to the existing simulation without restart
   *
   * @param {string} entityId - The entity to expand network from
   *
   * Algorithm:
   * 1. Check if entity already expanded (prevent duplicates)
   * 2. Query database for entity relationships
   * 3. Add new nodes with random initial positions (for natural spread)
   * 4. Add new links (skip if bidirectional duplicate exists)
   * 5. Update simulation forces and restart with high alpha
   * 6. Start animation if paused
   * 7. Update UI panels with new network state
   */
  async function expandNetwork(entityId) {
    const normalized = entityId.toLowerCase();

    // Prevent duplicate expansion
    if (expandedEntities.has(normalized)) {
      statusBar.setContent(`{center}{#ff1a90-fg}⚠{/} Entity already expanded: ${entityId}{/center}`);
      screen.render();
      return;
    }

    statusBar.setContent(`{center}{#ff1a90-fg}⟳{/} Expanding network for: ${entityId}...{/center}`);
    screen.render();

    try {
      const { queryByEntity } = await import("../database.js");
      const newData = await queryByEntity(entityId);

      if (newData.total_scraps === 0) {
        statusBar.setContent(`{center}{#595959-fg}✗{/} No relationships found for: ${entityId}{/center}`);
        screen.render();
        return;
      }

      expandedEntities.add(normalized);
      networkDepth++;

      // Add new nodes with random positions (allows physics to spread naturally)
      newData.graph.nodes.forEach((newNode) => {
        if (!nodes.find((n) => n.id === newNode.id)) {
          const node = {
            ...newNode,
            x: Math.random() * (width - 20) + 10,
            y: Math.random() * (height - 10) + 5,
          };
          nodes.push(node);
        }
      });

      // Add new links (skip bidirectional duplicates)
      newData.graph.edges.forEach((newEdge) => {
        const existingLink = links.find(
          (l) =>
            (l.source === newEdge.source && l.target === newEdge.target) ||
            (l.source === newEdge.target && l.target === newEdge.source)
        );
        if (!existingLink) {
          links.push({
            source: newEdge.source,
            target: newEdge.target,
            relationship: newEdge.relationship,
            count: newEdge.count,
          });
        }
      });

      // Update simulation with new data and restart with high energy
      simulation.nodes(nodes);
      simulation.force("link").links(links);
      simulation.alpha(1).restart();

      if (!animationRunning) startAnimation();

      updateConnectionsList();
      updateStatusBar();
      statusBar.setContent(
        `{center}{#ff1a90-fg}✓{/} Expanded ${entityId} · Added ${newData.graph.nodes.length} nodes, ${newData.graph.edges.length} links{/center}`
      );
      screen.render();
    } catch (error) {
      statusBar.setContent(`{center}{red-fg}✗{/} Error expanding: ${error.message}{/center}`);
      screen.render();
    }
  }

  /**
   * Display a list of scraps that mention the specified entity
   * Shows up to 15 scraps in the details panel with their IDs
   *
   * @param {string} entityId - The entity to show scraps for
   */
  function listScraps(entityId) {
    const connection = entityData.connections.find((c) => c.entity === entityId);

    if (!connection || !connection.scraps) {
      detailsBox.setContent(`{bold}${entityId}{/bold}\n\n{#595959-fg}No scraps found{/}`);
      screen.render();
      return;
    }

    let content = `{bold}${entityId}{/bold}\n\n`;
    content += `{#ff1a90-fg}Found in ${connection.scraps.length} scraps:{/}\n\n`;

    connection.scraps.slice(0, 15).forEach((scrapId, idx) => {
      content += `{#595959-fg}${idx + 1}.{/} ${scrapId}\n`;
    });

    if (connection.scraps.length > 15) {
      content += `\n{#595959-fg}... and ${connection.scraps.length - 15} more{/}`;
    }

    content += `\n\n{#595959-fg}Press ENTER to explore this entity{/}`;

    detailsBox.setContent(content);
    screen.render();
  }

  // =============================================================================
  // KEYBOARD CONTROLS & EVENT HANDLERS
  // =============================================================================

  // Q / Ctrl+C: Quit application
  screen.key(["q", "C-c"], () => {
    stopAnimation();
    process.exit(0);
  });

  // SPACE: Toggle physics animation on/off
  screen.key(["space"], () => {
    if (animationRunning) {
      stopAnimation();
    } else {
      startAnimation();
    }
    updateStatusBar();
  });

  // E: Expand network from selected node (query its relationships)
  screen.key(["e"], async () => {
    const selectedNode = nodes[selectedNodeIndex];
    if (selectedNode && selectedNode.type !== "query") {
      await expandNetwork(selectedNode.id);
    }
  });

  // L: List all scraps mentioning selected entity
  screen.key(["l"], () => {
    const selectedNode = nodes[selectedNodeIndex];
    if (selectedNode) {
      listScraps(selectedNode.id);
    }
  });

  // +/=: Spider out - expand all connected nodes from selected entity (batch expansion)
  screen.key(["+", "="], async () => {
    const selectedNode = nodes[selectedNodeIndex];
    if (!selectedNode) return;

    statusBar.setContent(`{center}{#ff1a90-fg}⟳{/} Expanding all connections...{/center}`);
    screen.render();

    // Get all connected nodes
    const connectedNodeIds = [];
    links.forEach((link) => {
      const sourceNode = typeof link.source === "object" ? link.source : nodes.find((n) => n.id === link.source);
      const targetNode = typeof link.target === "object" ? link.target : nodes.find((n) => n.id === link.target);

      if (sourceNode?.id === selectedNode.id && targetNode) {
        connectedNodeIds.push(targetNode.id);
      }
      if (targetNode?.id === selectedNode.id && sourceNode) {
        connectedNodeIds.push(sourceNode.id);
      }
    });

    // Expand each connected node
    let expanded = 0;
    for (const nodeId of connectedNodeIds) {
      const normalized = nodeId.toLowerCase();
      if (!expandedEntities.has(normalized)) {
        await expandNetwork(nodeId);
        expanded++;
      }
    }

    statusBar.setContent(
      `{center}{#ff1a90-fg}✓{/} Expanded ${expanded} new entities from ${selectedNode.id}{/center}`
    );
    screen.render();
  });

  // ↑/K: Navigate to previous node (vim-style)
  screen.key(["up", "k"], () => {
    if (nodes.length > 0) {
      selectedNodeIndex = (selectedNodeIndex - 1 + nodes.length) % nodes.length;
      showNodeDetails(nodes[selectedNodeIndex]);
      renderGraph();
      screen.render();
    }
  });

  // ↓/J: Navigate to next node (vim-style)
  screen.key(["down", "j"], () => {
    if (nodes.length > 0) {
      selectedNodeIndex = (selectedNodeIndex + 1) % nodes.length;
      showNodeDetails(nodes[selectedNodeIndex]);
      renderGraph();
      screen.render();
    }
  });

  // ENTER: Recursive exploration - dive into selected entity (creates new graph view)
  screen.key(["enter"], async () => {
    const selectedNode = nodes[selectedNodeIndex];
    if (selectedNode && selectedNode.type !== "query") {
      // Destroy current view and create new one centered on selected entity
      stopAnimation();
      screen.destroy();

      // Re-import to avoid circular dependency issues
      const { queryByEntity } = await import("../database.js");
      const newData = await queryByEntity(selectedNode.id);

      if (newData.total_scraps > 0) {
        createEntityGraphView(newData, selectedNode.id);
      } else {
        console.log(`No relationships found for entity: ${selectedNode.id}`);
        process.exit(0);
      }
    }
  });

  // R: Reset simulation with high energy (re-settle nodes)
  screen.key(["r"], () => {
    simulation.alpha(1).restart();
    if (!animationRunning) {
      startAnimation();
    }
  });

  // Connection list click handler - sync selection between list and graph
  connectionsBox.on("select", (item, index) => {
    const connection = entityData.connections[index];
    if (connection) {
      const nodeIndex = nodes.findIndex((n) => n.id === connection.entity);
      if (nodeIndex !== -1) {
        selectedNodeIndex = nodeIndex;
        showNodeDetails(nodes[selectedNodeIndex]);
        renderGraph();
        screen.render();
      }
    }
  });

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  // Initial render of all UI components
  updateConnectionsList();
  updateStatusBar();
  renderGraph();
  if (nodes.length > 0) {
    showNodeDetails(nodes[0]);
  }
  screen.render();

  // Auto-start physics animation on launch
  startAnimation();
}
