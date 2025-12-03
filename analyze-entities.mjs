import { loadBookmarks } from './database.js';

const bookmarks = await loadBookmarks();

// Build entity connection map
const entityConnections = new Map();

bookmarks.forEach(scrap => {
  if (!scrap.relationships || !Array.isArray(scrap.relationships)) return;

  scrap.relationships.forEach(rel => {
    const source = String(rel.source || '').trim();
    const target = String(rel.target || '').trim();

    if (!source || !target) return;

    // Track connections for both source and target
    [source, target].forEach(entity => {
      if (!entityConnections.has(entity)) {
        entityConnections.set(entity, {
          name: entity,
          connections: new Set(),
          relationshipTypes: new Set(),
          scrapCount: 0
        });
      }
      const data = entityConnections.get(entity);
      data.connections.add(source === entity ? target : source);
      data.relationshipTypes.add(rel.relationship);
      data.scrapCount++;
    });
  });
});

// Sort by connection count
const sorted = Array.from(entityConnections.values())
  .map(e => ({
    name: e.name,
    connections: e.connections.size,
    relationshipTypes: e.relationshipTypes.size,
    scrapCount: e.scrapCount
  }))
  .sort((a, b) => b.connections - a.connections)
  .slice(0, 20);

console.log('\n🔍 TOP 20 MOST CONNECTED ENTITIES:\n');
sorted.forEach((e, i) => {
  console.log(`${(i+1).toString().padStart(2)}. ${e.name.padEnd(40)} │ ${e.connections} connections │ ${e.relationshipTypes} rel types │ ${e.scrapCount} mentions`);
});

// Find entities with diverse relationship types
console.log('\n\n🌐 ENTITIES WITH MOST DIVERSE RELATIONSHIPS:\n');
const diverse = Array.from(entityConnections.values())
  .map(e => ({
    name: e.name,
    connections: e.connections.size,
    relationshipTypes: e.relationshipTypes.size,
    scrapCount: e.scrapCount
  }))
  .filter(e => e.connections >= 3)
  .sort((a, b) => b.relationshipTypes - a.relationshipTypes)
  .slice(0, 15);

diverse.forEach((e, i) => {
  console.log(`${(i+1).toString().padStart(2)}. ${e.name.padEnd(40)} │ ${e.relationshipTypes} types │ ${e.connections} connections`);
});
