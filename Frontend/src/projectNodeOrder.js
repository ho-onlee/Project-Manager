export function calculateProjectNodeOrders(nodes, relationships) {
  const root = nodes.find(node => node.is_project_root || node.node_type === 'project');
  const nextOrders = new Map(nodes.map(node => [node.id, node.order ?? 0]));
  if (!root) return nextOrders;

  const outgoing = new Map(nodes.map(node => [node.id, []]));
  const addEdge = (sourceId, targetId) => {
    if (outgoing.has(sourceId) && outgoing.has(targetId)) outgoing.get(sourceId).push(targetId);
  };

  nodes.forEach(node => {
    if (node.parent) addEdge(node.parent, node.id);
  });
  relationships.forEach(link => {
    const sourceIsRoot = link.source === root.id;
    const targetIsRoot = link.target === root.id;
    if (targetIsRoot && !sourceIsRoot) addEdge(root.id, link.source);
    else addEdge(link.source, link.target);
  });

  const reachable = new Set([root.id]);
  const pending = [root.id];
  while (pending.length) {
    const sourceId = pending.shift();
    (outgoing.get(sourceId) || []).forEach(targetId => {
      if (!reachable.has(targetId)) {
        reachable.add(targetId);
        pending.push(targetId);
      }
    });
  }

  const indegrees = new Map([...reachable].map(id => [id, 0]));
  reachable.forEach(sourceId => {
    outgoing.get(sourceId).forEach(targetId => {
      if (reachable.has(targetId)) indegrees.set(targetId, indegrees.get(targetId) + 1);
    });
  });

  const ready = [...reachable].filter(id => indegrees.get(id) === 0);
  const ranks = new Map([[root.id, 0]]);
  let visited = 0;
  while (ready.length) {
    const sourceId = ready.shift();
    visited += 1;
    outgoing.get(sourceId).forEach(targetId => {
      if (!reachable.has(targetId)) return;
      ranks.set(targetId, Math.max(ranks.get(targetId) || 0, (ranks.get(sourceId) || 0) + 1));
      indegrees.set(targetId, indegrees.get(targetId) - 1);
      if (indegrees.get(targetId) === 0) ready.push(targetId);
    });
  }

  if (visited !== reachable.size) return nextOrders;
  ranks.forEach((rank, id) => nextOrders.set(id, rank));
  return nextOrders;
}