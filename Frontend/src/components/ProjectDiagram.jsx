import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createProjectNodeAPI, createProjectRelationshipAPI, deleteProjectNodeAPI, deleteProjectRelationshipAPI, fetchEnvironments, fetchSkills, fetchTools, updateProjectAPI, updateProjectNodeAPI } from '../api';
import { calculateProjectNodeOrders } from '../projectNodeOrder';

function flatten(nodes, depth = 0) {
  return nodes.flatMap(node => {
    const isImage = node.node_type === 'image';
    const usesDescriptionAsContent = node.node_type === 'text' || node.node_type === 'list';
    const normalizedNode = {
      ...node,
      ...(isImage && !node.content && node.description ? { content: node.description } : {}),
      ...(usesDescriptionAsContent && !node.description && node.content ? { description: node.content } : {}),
      depth
    };
    return [normalizedNode, ...flatten(node.children || [], depth + 1)];
  });
}

function readPaletteCache(type, fallback) {
  try {
    const value = window.localStorage.getItem(`projectnote-palette-${type}`);
    const parsed = value ? JSON.parse(value) : fallback;
    if (type === 'position' && parsed && window.innerWidth > 800) return { ...parsed, x: Math.max(240, parsed.x) };
    return type === 'width' && parsed ? Math.min(Math.max(parsed, 180), 320) : parsed;
  } catch {
    return fallback;
  }
}

export default function ProjectDiagram({ project, onBack }) {
  const [nodes, setNodes] = useState(flatten(project.nodes || []));
  const [relationships, setRelationships] = useState(project.relationships || []);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedId, setLastSelectedId] = useState(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [panStart, setPanStart] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const [skills, setSkills] = useState([]);
  const [tools, setTools] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [paletteTab, setPaletteTab] = useState('skills');
  const blockItems = [
    { title: 'Text', node_type: 'text', description: 'Write something here.' },
    { title: 'Image', node_type: 'image', content: '', image_url: '' },
    { title: 'Ordered list', node_type: 'list', list_style: 'ol', description: 'First item\nSecond item' },
    { title: 'Unordered list', node_type: 'list', list_style: 'ul', description: 'First item\nSecond item' }
  ];
  const [projectDetails, setProjectDetails] = useState({ title: project.title, description: project.description || '' });
  const [inspectorPosition, setInspectorPosition] = useState({ x: null, y: 116 });
  const [paletteMinimized, setPaletteMinimized] = useState(() => window.innerWidth <= 800);
  const [inspectorMinimized, setInspectorMinimized] = useState(() => window.innerWidth <= 800);
  const [panelDrag, setPanelDrag] = useState(null);
  const [connectorMode, setConnectorMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null);
  const [connectionPointer, setConnectionPointer] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [imagePanStart, setImagePanStart] = useState(null);
  const [palettePosition, setPalettePosition] = useState(() => readPaletteCache('position', { x: 240, y: 116 }));
  const [paletteWidth, setPaletteWidth] = useState(() => readPaletteCache('width', null));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const diagramRef = useRef(null);
  const canvasRef = useRef(null);
  const paletteRef = useRef(null);
  const selected = nodes.find(node => node.id === selectedId);
  const selectedNodes = nodes.filter(node => selectedIds.has(node.id));
  const nodeMap = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const isMobileDiagram = viewportWidth <= 800;
  const mobileNodePositions = useMemo(() => {
    if (!isMobileDiagram) return new Map();
    const orderedNodes = [...nodes].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.title.localeCompare(right.title));
    const left = Math.max(12, (viewportWidth - 224) / 2);
    return new Map(orderedNodes.map((node, index) => [node.id, { x: left, y: 72 + index * 142 }]));
  }, [isMobileDiagram, nodes, viewportWidth]);
  const mobileCanvasHeight = Math.max(520, nodes.length * 142 + 92);

  useEffect(() => {
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
      if (window.innerWidth <= 800) {
        setPaletteMinimized(true);
        setInspectorMinimized(true);
      }
    };
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  const displayedNodePosition = node => mobileNodePositions.get(node.id) || node;

  const getWorldPoint = event => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: (event.clientX - bounds.left + canvasRef.current.scrollLeft - canvasPan.x) / canvasZoom,
      y: (event.clientY - bounds.top + canvasRef.current.scrollTop - canvasPan.y) / canvasZoom,
    };
  };

  useEffect(() => {
    Promise.all([fetchSkills(), fetchTools(), fetchEnvironments()]).then(([skillsResponse, toolsResponse, environmentsResponse]) => {
      setSkills(skillsResponse.data.results || skillsResponse.data);
      setTools(toolsResponse.data.results || toolsResponse.data);
      setEnvironments(environmentsResponse.data.results || environmentsResponse.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    window.localStorage.setItem('projectnote-palette-position', JSON.stringify(palettePosition));
  }, [palettePosition]);

  useEffect(() => {
    const palette = paletteRef.current;
    if (!palette) return undefined;
    const observer = new ResizeObserver(() => {
      const width = Math.min(320, Math.round(Math.max(palette.getBoundingClientRect().width, palette.scrollWidth)));
      setPaletteWidth(width);
      window.localStorage.setItem('projectnote-palette-width', JSON.stringify(width));
    });
    observer.observe(palette);
    return () => observer.disconnect();
  }, []);

  const saveProjectField = async (field, value) => {
    const nextValue = value.trim();
    if (!nextValue || nextValue === project[field]) return;
    setProjectDetails(current => ({ ...current, [field]: nextValue }));
    try { await updateProjectAPI(project.id, { [field]: nextValue }); } catch { /* Keep the local title visible. */ }
  };

  const addPaletteNode = async (item, position = {}) => {
    try {
      const baseX = position.x ?? 180 + (nodes.length % 3) * 220;
      const baseY = position.y ?? 140 + Math.floor(nodes.length / 3) * 150;
      const response = await createProjectNodeAPI({ project: project.id, parent: null, title: item.title, description: item.description || '', node_type: item.node_type, content: item.content || '', image_url: item.image_url || '', list_style: item.list_style || '', order: nodes.length, x: baseX, y: baseY });
      const node = { ...response.data, children: [], depth: 0 };
      const createdNodes = [node];
      const createdRelationships = [];
      if (item.node_type === 'tool') {
        const associatedSkills = (item.skillIds || []).map(skillId => skills.find(skill => skill.id === skillId)).filter(Boolean);
        const skillGap = 220;
        const skillStartX = baseX - ((associatedSkills.length - 1) * skillGap) / 2;
        for (const [index, skill] of associatedSkills.entries()) {
          const skillResponse = await createProjectNodeAPI({ project: project.id, parent: node.id, title: skill.name, description: skill.description || '', node_type: 'skill', order: index, x: skillStartX + (index * skillGap), y: baseY + 160 });
          createdNodes.push({ ...skillResponse.data, children: [], depth: 1 });
          const relationshipResponse = await createProjectRelationshipAPI({ project: project.id, source: node.id, target: skillResponse.data.id, label: 'contains' });
          createdRelationships.push(relationshipResponse.data);
        }
      }
      setNodes(current => [...current, ...createdNodes]);
      setRelationships(current => [...current, ...createdRelationships]);
      setSelectedId(node.id);
    } catch { /* The editor remains usable if the API is temporarily unavailable. */ }
  };

  const dropPaletteItem = event => {
    event.preventDefault();
    const data = JSON.parse(event.dataTransfer.getData('application/project-node') || '{}');
    if (data.title) {
      const bounds = event.currentTarget.getBoundingClientRect();
      addPaletteNode(data, {
        x: Math.max(0, event.clientX - bounds.left - 100 - canvasPan.x),
        y: Math.max(0, event.clientY - bounds.top - 48 - canvasPan.y)
      });
    }
  };

  const updateSelected = async changes => {
    setNodes(current => current.map(node => node.id === selectedId ? { ...node, ...changes } : node));
    try { await updateProjectNodeAPI(selectedId, changes); } catch { /* Keep the local edit visible until the next refresh. */ }
  };

  const updateSelectedLocal = changes => {
    setNodes(current => current.map(node => node.id === selectedId ? { ...node, ...changes } : node));
  };

  const saveSelectedField = async (nodeId, field, value) => {
    try { await updateProjectNodeAPI(nodeId, { [field]: value }); } catch { /* Keep the local edit visible until the next refresh. */ }
  };

  const browseImage = event => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => updateSelected({ image_url: reader.result });
    reader.readAsDataURL(file);
  };

  const deleteSelected = async () => {
    if (!selectedId || selected?.is_project_root) return;
    try {
      await deleteProjectNodeAPI(selectedId);
      setNodes(current => {
        const deletedIds = new Set([selectedId]);
        let changed = true;
        while (changed) {
          changed = false;
          current.forEach(node => {
            if (node.parent && deletedIds.has(node.parent) && !deletedIds.has(node.id)) {
              deletedIds.add(node.id);
              changed = true;
            }
          });
        }
        return current.filter(node => !deletedIds.has(node.id));
      });
      setRelationships(current => current.filter(link => link.source !== selectedId && link.target !== selectedId));
      setSelectedId(null);
      setSelectedIds(new Set());
      setSelectedRelationshipId(null);
    } catch { /* Keep the node selected if deletion fails. */ }
  };

  const deleteSelectedNodes = async () => {
    const deletable = selectedNodes.filter(node => !node.is_project_root);
    await Promise.all(deletable.map(node => deleteProjectNodeAPI(node.id)));
    const deletedIds = new Set(deletable.map(node => node.id));
    setNodes(current => current.filter(node => !deletedIds.has(node.id) && !deletedIds.has(node.parent)));
    setRelationships(current => current.filter(link => !deletedIds.has(link.source) && !deletedIds.has(link.target)));
    setSelectedIds(new Set());
    setSelectedId(null);
  };

  const deleteSelectedConnections = async () => {
    const selectedConnections = relationships.filter(link => selectedIds.has(link.source) || selectedIds.has(link.target));
    await Promise.all(selectedConnections.map(link => deleteProjectRelationshipAPI(link.id)));
    setRelationships(current => current.filter(link => !selectedConnections.some(selectedLink => selectedLink.id === link.id)));
    setSelectedRelationshipId(null);
  };

  const moveNode = event => {
    if (!draggingId || isMobileDiagram) return;
    const point = getWorldPoint(event);
    if (!point) return;
    setNodes(current => current.map(node => node.id === draggingId ? { ...node, x: point.x - dragOffset.x, y: point.y - dragOffset.y } : node));
  };

  const finishMove = async () => {
    if (!draggingId) return;
    const node = nodeMap.get(draggingId);
    setDraggingId(null);
    setDragOffset({ x: 0, y: 0 });
    if (node) await updateProjectNodeAPI(node.id, { x: node.x, y: node.y });
  };

  const beginNodeMove = (event, node) => {
    if (event.button === 1) {
      beginPan(event);
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    if (connectorMode) {
      beginConnection(event, node.id);
      return;
    }
    if (isMobileDiagram) return;
    const point = getWorldPoint(event);
    if (!point) return;
    setDraggingId(node.id);
    const displayed = displayedNodePosition(node);
    setDragOffset({ x: point.x - displayed.x, y: point.y - displayed.y });
  };

  const beginPan = event => {
    if (connectorMode && event.button !== 1) return;
    event.preventDefault();
    setPanStart({ x: event.clientX - canvasPan.x, y: event.clientY - canvasPan.y });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePan = event => {
    if (!panStart) return;
    setCanvasPan({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
  };

  const finishPan = () => setPanStart(null);

  const beginSelectionBox = event => {
    if (event.button !== 0 || event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setSelectionBox({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
  };

  const moveSelectionBox = event => {
    if (!selectionBox) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    setSelectionBox(current => ({ ...current, currentX: event.clientX - bounds.left, currentY: event.clientY - bounds.top }));
  };

  const finishSelectionBox = () => {
    if (!selectionBox) return;
    const left = Math.min(selectionBox.startX, selectionBox.currentX);
    const right = Math.max(selectionBox.startX, selectionBox.currentX);
    const top = Math.min(selectionBox.startY, selectionBox.currentY);
    const bottom = Math.max(selectionBox.startY, selectionBox.currentY);
    const selected = nodes.filter(node => {
      const displayed = displayedNodePosition(node);
      const nodeLeft = displayed.x * canvasZoom + canvasPan.x - (canvasRef.current?.scrollLeft || 0);
      const nodeTop = displayed.y * canvasZoom + canvasPan.y - (canvasRef.current?.scrollTop || 0);
      return nodeLeft < right && nodeLeft + 200 * canvasZoom > left && nodeTop < bottom && nodeTop + 96 * canvasZoom > top;
    });
    setSelectedIds(new Set(selected.map(node => node.id)));
    setSelectedId(selected[selected.length - 1]?.id || null);
    setLastSelectedId(selected[selected.length - 1]?.id || null);
    setSelectionBox(null);
  };

  const startPanelDrag = (type, event) => {
    const panel = event.currentTarget.parentElement.getBoundingClientRect();
    setPanelDrag({ type, offsetX: event.clientX - panel.left, offsetY: event.clientY - panel.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePanel = event => {
    if (!panelDrag || !diagramRef.current) return;
    const bounds = diagramRef.current.getBoundingClientRect();
    const nextPosition = { x: Math.max(window.innerWidth > 800 ? 240 : 8, event.clientX - bounds.left - panelDrag.offsetX), y: Math.max(8, event.clientY - bounds.top - panelDrag.offsetY) };
    if (panelDrag.type === 'palette') setPalettePosition(nextPosition);
    if (panelDrag.type === 'inspector') setInspectorPosition(nextPosition);
  };

  const stopPanelDrag = () => setPanelDrag(null);

  const clearSelection = event => {
    if (event.target === event.currentTarget) {
      setSelectedId(null);
      setSelectedIds(new Set());
      setSelectedRelationshipId(null);
    }
  };

  const connectedTo = (sourceId, targetId) => relationships.some(link => (link.source === sourceId && link.target === targetId) || (link.source === targetId && link.target === sourceId));

  const selectNodeWithModifiers = (event, nodeId) => {
    if (event.shiftKey && lastSelectedId && connectedTo(lastSelectedId, nodeId)) {
      setSelectedIds(current => new Set([...current, lastSelectedId, nodeId]));
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedIds(current => {
        const next = new Set(current);
        if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
        return next;
      });
    } else {
      setSelectedIds(new Set([nodeId]));
    }
    setSelectedId(nodeId);
    setLastSelectedId(nodeId);
    setSelectedRelationshipId(null);
  };

  const deleteSelectedRelationship = async () => {
    if (!selectedRelationshipId) return;
    try {
      await deleteProjectRelationshipAPI(selectedRelationshipId);
      setRelationships(current => current.filter(link => link.id !== selectedRelationshipId));
      setSelectedRelationshipId(null);
    } catch { /* Keep the relationship selected if deletion fails. */ }
  };

  const createsRelationshipLoop = (sourceId, targetId) => {
    const outgoing = new Map();
    relationships.forEach(link => {
      const targets = outgoing.get(link.source) || [];
      targets.push(link.target);
      outgoing.set(link.source, targets);
    });
    const pending = [targetId];
    const visited = new Set();
    while (pending.length) {
      const current = pending.pop();
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(outgoing.get(current) || []));
    }
    return false;
  };

  const rebalanceNodeOrders = async nextRelationships => {
    const nextOrders = calculateProjectNodeOrders(nodes, nextRelationships);
    const updates = nodes.filter(node => node.order !== nextOrders.get(node.id)).map(node => ({ ...node, order: nextOrders.get(node.id) }));
    setNodes(current => current.map(node => updates.find(updated => updated.id === node.id) || node));
    await Promise.all(updates.map(node => updateProjectNodeAPI(node.id, { order: node.order })));
  };

  const beginConnection = (event, nodeId) => {
    if (!connectorMode) return;
    event.stopPropagation();
    setConnectionStart(nodeId);
    setConnectionPointer(getWorldPoint(event));
    canvasRef.current?.setPointerCapture(event.pointerId);
  };

  const moveConnection = event => {
    if (!connectionStart) return;
    setConnectionPointer(getWorldPoint(event));
  };

  const changeCanvasZoom = amount => {
    setCanvasZoom(current => Math.min(2.5, Math.max(.5, Number((current + amount).toFixed(2)))));
  };

  const resetCanvasZoom = () => {
    setCanvasZoom(1);
    setCanvasPan({ x: 0, y: 0 });
    canvasRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };

  const finishConnection = async (event, targetId) => {
    if (!connectionStart) return;
    event.stopPropagation();
    const sourceId = connectionStart;
    setConnectionStart(null);
    setConnectionPointer(null);
    if (sourceId === targetId) return;
    if (createsRelationshipLoop(sourceId, targetId)) return;
    try {
      const response = await createProjectRelationshipAPI({ project: project.id, source: sourceId, target: targetId, label: '' });
      const nextRelationships = [...relationships, response.data];
      setRelationships(nextRelationships);
      await rebalanceNodeOrders(nextRelationships);
    } catch { /* Invalid or duplicate links are rejected by the API. */ }
  };

  const finishConnectionAtPointer = event => {
    if (!connectorMode || !connectionStart) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-node-id]') || event.target.closest?.('[data-node-id]');
    if (target) {
      finishConnection(event, target.dataset.nodeId);
    } else {
      setConnectionStart(null);
      setConnectionPointer(null);
    }
  };

  const cancelConnection = event => {
    if (!connectionStart || event.target !== event.currentTarget) return;
    setConnectionStart(null);
    setConnectionPointer(null);
  };

  const nodePreview = node => {
    if (node.node_type === 'image' && node.image_url) return <img src={node.image_url} alt="" />;
    if (node.node_type === 'list') {
      const List = node.list_style === 'ol' ? 'ol' : 'ul';
      return <List>{(node.description || '').split('\n').filter(Boolean).map((item, index) => <li key={`${node.id}-${index}`}>{item}</li>)}</List>;
    }
    if (node.node_type === 'text') return <p>{node.description || 'Empty text block'}</p>;
    return <small>{node.description || 'Add a description'}</small>;
  };

  const nodeTypeIcon = node => {
    if (node.is_project_root || node.node_type === 'project') return { icon: '✦', label: 'Project' };
    if (node.node_type === 'skill') return { icon: '◇', label: 'Skill' };
    if (node.node_type === 'tool') return { icon: '◈', label: 'Tool' };
    if (node.node_type === 'environment') return { icon: '⌂', label: 'Environment' };
    if (node.node_type === 'image') return { icon: '▧', label: 'Image' };
    if (node.node_type === 'list') return { icon: node.list_style === 'ol' ? '≣' : '☷', label: node.list_style === 'ol' ? 'Ordered list' : 'Unordered list' };
    if (node.node_type === 'text') return { icon: 'T', label: 'Text' };
    return { icon: '·', label: 'Step' };
  };

  const openImagePreview = (event, node) => {
    if (node.node_type !== 'image' || !node.image_url) return;
    event.stopPropagation();
    setImagePreview(node.image_url);
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  };

  const closeImagePreview = () => {
    setImagePreview(null);
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (!imagePreview) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') closeImagePreview();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [imagePreview]);

  const zoomImage = event => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursor = { x: event.clientX - (bounds.left + bounds.width / 2), y: event.clientY - (bounds.top + bounds.height / 2) };
    const nextZoom = Math.min(4, Math.max(.5, imageZoom + (event.deltaY < 0 ? .15 : -.15)));
    if (nextZoom === imageZoom) return;
    setImagePan(current => ({ x: cursor.x - (cursor.x - current.x) * nextZoom / imageZoom, y: cursor.y - (cursor.y - current.y) * nextZoom / imageZoom }));
    setImageZoom(nextZoom);
  };

  const startImagePan = event => {
    if (imageZoom <= 1) return;
    event.preventDefault();
    setImagePanStart({ x: event.clientX - imagePan.x, y: event.clientY - imagePan.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveImagePan = event => {
    if (!imagePanStart) return;
    setImagePan({ x: event.clientX - imagePanStart.x, y: event.clientY - imagePanStart.y });
  };

  const stopImagePan = () => setImagePanStart(null);

  const resetImageView = () => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  };

  const paletteItemIcon = item => {
    if (paletteTab === 'blocks') return nodeTypeIcon(item).icon;
    if (paletteTab === 'skills') return '◇';
    if (paletteTab === 'tools') return '◈';
    if (paletteTab === 'environments') return '⌂';
    return '·';
  };

  return (
    <section ref={diagramRef} className={`diagram-view ${connectorMode ? 'connector-mode' : ''}`} onPointerMove={movePanel} onPointerUp={stopPanelDrag}>
      <button className="floating-project-back" type="button" aria-label="Back to project cards" title="Back to project cards" onClick={onBack}>×</button>
      <div className="diagram-layout">
        <div ref={canvasRef} className={`diagram-canvas ${isMobileDiagram ? 'mobile-diagram-canvas' : ''}`} style={{ backgroundPosition: `${canvasPan.x}px ${canvasPan.y}px` }} onContextMenu={event => event.preventDefault()} onDragOver={event => event.preventDefault()} onDrop={dropPaletteItem} onPointerDown={event => { clearSelection(event); cancelConnection(event); beginSelectionBox(event); if (event.button === 1) beginPan(event); }} onPointerMove={event => { moveNode(event); moveConnection(event); movePan(event); moveSelectionBox(event); }} onPointerUp={event => { finishMove(event); finishConnectionAtPointer(event); finishPan(); finishSelectionBox(); }} onPointerLeave={() => { finishMove(); finishPan(); finishSelectionBox(); }}>
          <div className={`diagram-pan-layer ${isMobileDiagram ? 'mobile-diagram-pan-layer' : ''}`} style={{ height: isMobileDiagram ? mobileCanvasHeight : undefined, transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})` }}>
          <svg className="diagram-lines" aria-hidden="true" style={{ height: isMobileDiagram ? mobileCanvasHeight : undefined }}>
            <defs>
              <marker id="relationship-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#78936a" />
              </marker>
            </defs>
            {relationships.map(link => {
              const source = nodeMap.get(link.source);
              const target = nodeMap.get(link.target);
              if (!source || !target) return null;
              const displayedSource = displayedNodePosition(source);
              const displayedTarget = displayedNodePosition(target);
              const sourceOrder = source.order ?? 0;
              const targetOrder = target.order ?? 0;
              const isStagnant = link.stagnant ?? sourceOrder === targetOrder;
              const sourceIsFirst = isMobileDiagram ? sourceOrder <= targetOrder : sourceOrder <= targetOrder;
              const start = sourceIsFirst ? displayedSource : displayedTarget;
              const end = sourceIsFirst ? displayedTarget : displayedSource;
              const thickness = Math.max(1.5, 5 - (Math.max(sourceOrder, targetOrder) * .7));
              const selectRelationship = event => { event.stopPropagation(); setSelectedRelationshipId(link.id); setSelectedId(null); };
              return <g key={link.id} onClick={selectRelationship}>
                <line className="relationship-hitbox" x1={start.x + 100} y1={start.y + 48} x2={end.x + 100} y2={end.y + 48} />
                <line className={`relationship-line ${isStagnant ? 'stagnant' : ''} ${selectedRelationshipId === link.id ? 'selected' : ''}`} style={{ strokeWidth: thickness }} x1={start.x + 100} y1={start.y + 48} x2={end.x + 100} y2={end.y + 48} />
              </g>;
            })}
            {connectionStart && connectionPointer && (() => {
              const source = nodeMap.get(connectionStart);
              if (!source) return null;
              const displayed = displayedNodePosition(source);
              return <line className="connection-preview" x1={displayed.x + 100} y1={displayed.y + 48} x2={connectionPointer.x} y2={connectionPointer.y} />;
            })()}
          </svg>
          {nodes.map(node => (
            <button data-node-id={node.id} className={`diagram-node ${selectedIds.has(node.id) ? 'selected' : ''} ${connectionStart === node.id ? 'connection-source' : ''}`} key={node.id} style={{ left: displayedNodePosition(node).x, top: displayedNodePosition(node).y }} type="button" onClick={event => !connectorMode && selectNodeWithModifiers(event, node.id)} onDoubleClick={event => openImagePreview(event, node)} onPointerDown={event => beginNodeMove(event, node)} onPointerMove={moveConnection}>
              <span className="diagram-node-type" title={nodeTypeIcon(node).label} aria-label={nodeTypeIcon(node).label}>{nodeTypeIcon(node).icon}</span><strong>{node.title}</strong>{nodePreview(node)}
            </button>
          ))}
          {!nodes.length && <div className="diagram-empty">Drag a skill or tool here to begin the process.</div>}
          </div>
          {selectionBox && <div className="diagram-selection-box" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}
        </div>
        <aside className={`diagram-inspector ${inspectorMinimized ? 'is-minimized' : ''}`} style={{ left: isMobileDiagram ? (inspectorMinimized ? 64 : undefined) : inspectorPosition.x === null ? undefined : inspectorPosition.x, right: isMobileDiagram ? (inspectorMinimized ? undefined : 12) : inspectorPosition.x === null ? 28 : 'auto', top: isMobileDiagram ? (inspectorMinimized ? 12 : 62) : inspectorPosition.y, bottom: undefined }}>
          <div className="floating-panel-header" onPointerDown={event => startPanelDrag('inspector', event)}><span>Inspector</span><button type="button" aria-label={inspectorMinimized ? 'Expand inspector' : 'Minimize inspector'} onPointerDown={event => event.stopPropagation()} onClick={() => setInspectorMinimized(value => !value)}>{inspectorMinimized ? '＋' : '−'}</button></div>
          {!inspectorMinimized && <>
            {selectedIds.size > 1 ? <>
              <span className="eyebrow">{selectedIds.size} nodes selected</span>
              <button className="delete-button" type="button" onClick={deleteSelectedNodes}>Delete selected nodes</button>
              <button className="delete-button" type="button" onClick={deleteSelectedConnections}>Delete selected connections</button>
            </> : selectedRelationshipId ? <>
              <span className="eyebrow">Connection</span>
              <p className="inspector-note">Selected edge between two nodes.</p>
              <button className="delete-button" type="button" onClick={deleteSelectedRelationship}>Delete connection</button>
            </> : selected ? <>
              <label>Title<input value={selected.title} onChange={event => updateSelected({ title: event.target.value })} /></label>
              <label>Type<div className="diagram-node-type-detail"><span aria-hidden="true">{nodeTypeIcon(selected).icon}</span><strong>{nodeTypeIcon(selected).label}</strong></div></label>
              {(selected.node_type === 'text' || selected.node_type === 'list') ? <label>Description<textarea value={selected.description} placeholder={selected.node_type === 'list' ? 'One item per line' : 'Text description'} onChange={event => updateSelectedLocal({ description: event.target.value })} onBlur={event => saveSelectedField(selected.id, 'description', event.target.value)} /></label> : selected.node_type === 'image' ? <label>Description<textarea value={selected.content} placeholder="Add image description" onChange={event => updateSelectedLocal({ content: event.target.value })} onBlur={event => saveSelectedField(selected.id, 'content', event.target.value)} /></label> : <label>Description<textarea value={selected.description} placeholder="Add a description" onChange={event => updateSelectedLocal({ description: event.target.value })} onBlur={event => saveSelectedField(selected.id, 'description', event.target.value)} /></label>}
              {selected.node_type === 'image' && <div className="image-node-field">
                {selected.image_url && <img className="image-node-thumbnail" src={selected.image_url} alt={selected.title || 'Selected image'} onClick={event => openImagePreview(event, selected)} />}
                <label className="image-node-picker">{selected.image_url ? 'Replace image' : 'Choose image'}<input type="file" accept="image/*" onChange={browseImage} /></label>
              </div>}
              {selected.node_type === 'list' && <label>List style<select value={selected.list_style} onChange={event => updateSelected({ list_style: event.target.value })}><option value="ol">Ordered</option><option value="ul">Unordered</option></select></label>}
              {!selected.is_project_root && <button className="delete-button" type="button" onClick={deleteSelected}>Delete node</button>}
            </> : <>
              <label>Title<input value={projectDetails.title} onChange={event => setProjectDetails(current => ({ ...current, title: event.target.value }))} onBlur={event => saveProjectField('title', event.target.value)} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} /></label>
              <label>Description<textarea value={projectDetails.description} placeholder="Add a project description" onChange={event => setProjectDetails(current => ({ ...current, description: event.target.value }))} onBlur={event => saveProjectField('description', event.target.value)} /></label>
            </>}
          </>}
        </aside>
      </div>
      <aside ref={paletteRef} className={`floating-project-palette ${paletteMinimized ? 'is-minimized' : ''}`} style={{ left: isMobileDiagram ? 12 : palettePosition.x, top: isMobileDiagram ? (paletteMinimized ? 12 : 62) : palettePosition.y, width: isMobileDiagram ? (paletteMinimized ? 42 : 220) : paletteWidth || undefined, maxWidth: isMobileDiagram ? 'calc(100vw - 24px)' : undefined }}>
        <div className="floating-panel-header" onPointerDown={event => startPanelDrag('palette', event)}><span>Insert</span><button type="button" aria-label={paletteMinimized ? 'Expand palette' : 'Minimize palette'} onPointerDown={event => event.stopPropagation()} onClick={() => setPaletteMinimized(value => !value)}>{paletteMinimized ? '＋' : '−'}</button></div>
        {!paletteMinimized && <>
          <div className="project-palette-tabs"><button className={`project-palette-tab ${paletteTab === 'skills' ? 'active' : ''}`} type="button" onClick={() => setPaletteTab('skills')}>Skills</button><button className={`project-palette-tab ${paletteTab === 'tools' ? 'active' : ''}`} type="button" onClick={() => setPaletteTab('tools')}>Tools</button><button className={`project-palette-tab ${paletteTab === 'environments' ? 'active' : ''}`} type="button" onClick={() => setPaletteTab('environments')}>Envs</button><button className={`project-palette-tab ${paletteTab === 'blocks' ? 'active' : ''}`} type="button" onClick={() => setPaletteTab('blocks')}>Blocks</button></div>
          <div className="floating-palette-list">{(paletteTab === 'blocks' ? blockItems : paletteTab === 'skills' ? skills : paletteTab === 'tools' ? tools : environments).map((item, index) => <button className="floating-palette-item" draggable key={item.id || item.node_type + index} type="button" onDragStart={event => event.dataTransfer.setData('application/project-node', JSON.stringify({ title: item.name || item.title, description: item.description || '', skillIds: item.skillIds, node_type: item.node_type || (paletteTab === 'skills' ? 'skill' : paletteTab === 'tools' ? 'tool' : 'environment'), content: item.content, image_url: item.image_url, list_style: item.list_style }))}><span>{paletteItemIcon(item)}</span><strong>{item.name || item.title}</strong></button>)}</div>
          {!(paletteTab === 'blocks' ? blockItems : paletteTab === 'skills' ? skills : paletteTab === 'tools' ? tools : environments).length && <p className="floating-palette-empty">No {paletteTab} yet.</p>}
        </>}
      </aside>
      <div className="diagram-zoom-controls" role="group" aria-label="Diagram zoom">
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={canvasZoom >= 2.5} onClick={() => changeCanvasZoom(.25)}>＋</button>
        <button className="diagram-zoom-level" type="button" aria-label="Reset zoom" title="Reset zoom" onClick={resetCanvasZoom}>{Math.round(canvasZoom * 100)}%</button>
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={canvasZoom <= .5} onClick={() => changeCanvasZoom(-.25)}>−</button>
      </div>
      <button className={`connector-toggle ${connectorMode ? 'active' : ''}`} type="button" aria-pressed={connectorMode} onClick={() => { setConnectorMode(value => !value); setConnectionStart(null); setConnectionPointer(null); }}><span aria-hidden="true">＋</span><small>{connectorMode ? 'Exit connect' : 'Connect nodes'}</small></button>
      {imagePreview && <div className="image-preview-backdrop" role="dialog" aria-modal="true" aria-label="Image preview" onClick={closeImagePreview}>
        <div className="image-preview-modal" onClick={event => event.stopPropagation()}>
          <button className="image-preview-close" type="button" aria-label="Close image preview" title="Close" onClick={closeImagePreview}>×</button>
          <div className="image-preview-viewport" onWheel={zoomImage} onPointerDown={startImagePan} onPointerMove={moveImagePan} onPointerUp={stopImagePan} onPointerCancel={stopImagePan}>
            <img src={imagePreview} alt="Expanded node" draggable="false" style={{ transform: `translate(calc(-50% + ${imagePan.x}px), calc(-50% + ${imagePan.y}px)) scale(${imageZoom})` }} />
          </div>
          <div className="image-preview-toolbar"><button type="button" onClick={() => setImageZoom(current => Math.max(.5, current - .25))}>−</button><button type="button" onClick={resetImageView}>{Math.round(imageZoom * 100)}%</button><button type="button" onClick={() => setImageZoom(current => Math.min(4, current + .25))}>＋</button></div>
        </div>
      </div>}
    </section>
  );
}
