import blessed from "blessed";
import * as d3 from "d3";

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
    height: "100%",
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

  // Help text at bottom
  const helpText = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "70%",
    height: 3,
    content: "{center}{#595959-fg}[SPACE] Toggle animation  [↑↓] Navigate  [ENTER] Explore entity  [Q] Quit{/}",
    tags: true,
  });

  // Build d3-force simulation
  const width = graphBox.width - 4;
  const height = graphBox.height - 4;

  // Convert entity graph to d3 format
  const nodes = entityData.graph.nodes.map((n) => ({
    ...n,
    x: width / 2,
    y: height / 2,
  }));

  const links = entityData.graph.edges.map((e) => ({
    ...e,
    source: e.source,
    target: e.target,
  }));

  // Create d3-force simulation
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

  // Warm up simulation
  for (let i = 0; i < 300; ++i) simulation.tick();

  let selectedNodeIndex = 0;
  let animationRunning = false;
  let animationInterval;

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

  function updateConnectionsList() {
    const items = entityData.connections.map((conn) => {
      const arrow = conn.direction === "outgoing" ? "→" : "←";
      return `${arrow} ${conn.entity} (${conn.count}x) - ${conn.relationship}`;
    });

    connectionsBox.setItems(items);
  }

  function startAnimation() {
    if (animationRunning) return;
    animationRunning = true;

    animationInterval = setInterval(() => {
      simulation.tick();
      renderGraph();
      screen.render();
    }, 100);
  }

  function stopAnimation() {
    if (animationInterval) {
      clearInterval(animationInterval);
      animationInterval = null;
    }
    animationRunning = false;
  }

  // Keyboard controls
  screen.key(["q", "C-c"], () => {
    stopAnimation();
    process.exit(0);
  });

  screen.key(["space"], () => {
    if (animationRunning) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });

  screen.key(["up", "k"], () => {
    if (nodes.length > 0) {
      selectedNodeIndex = (selectedNodeIndex - 1 + nodes.length) % nodes.length;
      showNodeDetails(nodes[selectedNodeIndex]);
      renderGraph();
      screen.render();
    }
  });

  screen.key(["down", "j"], () => {
    if (nodes.length > 0) {
      selectedNodeIndex = (selectedNodeIndex + 1) % nodes.length;
      showNodeDetails(nodes[selectedNodeIndex]);
      renderGraph();
      screen.render();
    }
  });

  screen.key(["enter"], async () => {
    const selectedNode = nodes[selectedNodeIndex];
    if (selectedNode && selectedNode.type !== "query") {
      // Recursive exploration: query for this entity
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

  screen.key(["r"], () => {
    // Reset simulation
    simulation.alpha(1).restart();
    if (!animationRunning) {
      startAnimation();
    }
  });

  // Connection list navigation
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

  // Initial render
  updateConnectionsList();
  renderGraph();
  if (nodes.length > 0) {
    showNodeDetails(nodes[0]);
  }
  screen.render();

  // Auto-start animation
  startAnimation();
}
