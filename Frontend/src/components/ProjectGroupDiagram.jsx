import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createProjectGroupItemAPI, createProjectGroupRelationshipAPI, deleteProjectGroupItemAPI, deleteProjectGroupRelationshipAPI, updateProjectAPI, updateProjectGroupAPI, updateProjectGroupItemAPI, updateProjectGroupRelationshipAPI } from '../api';

const annotationTools = [
  { id: 'select', label: 'Select', icon: '↖' },
  { id: 'text', label: 'Text note', icon: 'T' },
  { id: 'rectangle', label: 'Box', icon: '□' },
  { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'diamond', label: 'Diamond', icon: '◇' },
  { id: 'arrow', label: 'Arrow', icon: '↗' },
  { id: 'line', label: 'Line', icon: '／' },
];

const relationshipTypes = [
  { value: 'directional', label: 'Directional relationship', preview: 'Solid arrow' },
  { value: 'loose', label: 'Loose connection', preview: 'Dashed line' },
  { value: 'dependency', label: 'Dependency', preview: 'Dotted arrow' },
  { value: 'bidirectional', label: 'Bidirectional relationship', preview: 'Arrows both ways' },
];

function RelationshipTypeList({ value, onChange }) {
  return <ul className="group-edge-type-list" role="radiogroup" aria-label="Relationship type">
    {relationshipTypes.map(type => <li key={type.value}><button type="button" role="radio" aria-checked={value === type.value} className={value === type.value ? 'selected' : ''} onClick={() => onChange(type.value)}><span className={`edge-type-sample edge-${type.value}`} aria-hidden="true" /><span><strong>{type.label}</strong><small>{type.preview}</small></span></button></li>)}
  </ul>;
}

function readGroupPalettePosition() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('projectnote-group-palette-position'));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return { ...saved, x: window.innerWidth > 800 ? Math.max(240, saved.x) : saved.x };
  } catch { /* Use the default position when no valid preference is stored. */ }
  return { x: window.innerWidth > 800 ? 240 : 112, y: 116 };
}

export default function ProjectGroupDiagram({ group, projects, onBack }) {
  const [groupDetails, setGroupDetails] = useState({ title: group.title, description: group.description || '' });
  const [items, setItems] = useState(group.items || []);
  const [activeTool, setActiveTool] = useState('select');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dragItem, setDragItem] = useState(null);
  const [relationships, setRelationships] = useState(group.relationships || []);
  const [connectorMode, setConnectorMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null);
  const [connectionPointer, setConnectionPointer] = useState(null);
  const [relationshipType, setRelationshipType] = useState('directional');
  const [paletteTab, setPaletteTab] = useState('projects');
  const [paletteMinimized, setPaletteMinimized] = useState(false);
  const [inspectorMinimized, setInspectorMinimized] = useState(false);
  const canvasRef = useRef(null);
  const editorRef = useRef(null);
  const paletteRef = useRef(null);
  const paletteDragRef = useRef(null);
  const [palettePosition, setPalettePosition] = useState(readGroupPalettePosition);
  const selected = items.find(item => item.id === selectedItemId);
  const selectedRelationship = relationships.find(link => link.id === selectedRelationshipId);
  const projectsInGroup = useMemo(() => new Set(items.filter(item => item.item_type === 'project').map(item => String(item.project))), [items]);
  const availableProjects = projects.filter(project => !projectsInGroup.has(String(project.id)));

  useEffect(() => {
    window.localStorage.setItem('projectnote-group-palette-position', JSON.stringify(palettePosition));
  }, [palettePosition]);

  const canvasPoint = event => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left + canvas.parentElement.scrollLeft, y: event.clientY - bounds.top + canvas.parentElement.scrollTop };
  };

  const addCanvasItem = async itemData => {
    try {
      const response = await createProjectGroupItemAPI({ group: group.id, ...itemData });
      setItems(current => [...current, response.data]);
      setSelectedItemId(response.data.id);
      setSelectedRelationshipId(null);
    } catch {
      // Leave the canvas unchanged when an item cannot be saved.
    }
  };

  const startAnnotation = event => {
    if (event.target.closest?.('[data-group-item-id]')) return;
    if (activeTool === 'select') {
      setSelectedItemId(null);
      setSelectedRelationshipId(null);
      return;
    }
    event.preventDefault();
    const point = canvasPoint(event);
    setDraft({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y, itemType: activeTool === 'text' ? 'text' : 'shape', shapeType: activeTool });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveAnnotation = event => {
    if (!draft) return;
    const point = canvasPoint(event);
    setDraft(current => ({ ...current, currentX: point.x, currentY: point.y }));
  };

  const finishAnnotation = async () => {
    if (!draft) return;
    const left = Math.min(draft.startX, draft.currentX);
    const top = Math.min(draft.startY, draft.currentY);
    const width = Math.max(120, Math.abs(draft.currentX - draft.startX));
    const height = Math.max(76, Math.abs(draft.currentY - draft.startY));
    const itemData = draft.itemType === 'text'
      ? { item_type: 'text', title: 'Text note', content: '', x: left, y: top, width, height }
      : { item_type: 'shape', shape_type: draft.shapeType, title: '', content: '', x: left, y: top, width, height };
    setDraft(null);
    setActiveTool('select');
    await addCanvasItem(itemData);
  };

  const dropProject = async event => {
    event.preventDefault();
    const projectId = event.dataTransfer.getData('application/project-group-project');
    const project = projects.find(candidate => String(candidate.id) === projectId);
    if (!project || projectsInGroup.has(projectId)) return;
    const point = canvasPoint(event);
    await addCanvasItem({ item_type: 'project', project: project.id, title: project.title, x: Math.max(12, point.x - 110), y: Math.max(12, point.y - 60), width: 220, height: 140, order: items.length });
  };

  const moveConnection = event => {
    if (connectionStart) setConnectionPointer(canvasPoint(event));
  };

  const finishConnection = async event => {
    if (!connectionStart) return;
    const sourceId = connectionStart;
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-group-item-id]') || event.target.closest?.('[data-group-item-id]');
    const point = canvasPoint(event);
    const targetId = targetElement?.dataset.groupItemId || items.find(item =>
      point.x >= item.x && point.x <= item.x + item.width &&
      point.y >= item.y && point.y <= item.y + item.height
    )?.id;
    setConnectionStart(null);
    setConnectionPointer(null);
    if (!targetId || sourceId === targetId || relationships.some(link => (link.source === sourceId && link.target === targetId) || (link.source === targetId && link.target === sourceId))) return;
    try {
      const response = await createProjectGroupRelationshipAPI({ group: group.id, source: sourceId, target: targetId, relationship_type: relationshipType });
      setRelationships(current => [...current, response.data]);
      setSelectedRelationshipId(response.data.id);
      setSelectedItemId(null);
    } catch {
      setSelectedRelationshipId(null);
    }
  };

  const movePalette = event => {
    if (!paletteDragRef.current || !editorRef.current) return;
    const bounds = editorRef.current.getBoundingClientRect();
    const minX = window.innerWidth > 800 ? 240 : 8;
    const maxX = Math.max(minX, bounds.width - (paletteRef.current?.offsetWidth || 180));
    const maxY = Math.max(8, bounds.height - 48);
    setPalettePosition({
      x: Math.min(maxX, Math.max(minX, event.clientX - bounds.left - paletteDragRef.current.offsetX)),
      y: Math.min(maxY, Math.max(8, event.clientY - bounds.top - paletteDragRef.current.offsetY)),
    });
  };

  const startPaletteDrag = event => {
    if (event.target.closest('button')) return;
    const bounds = event.currentTarget.parentElement.getBoundingClientRect();
    paletteDragRef.current = { offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const stopPaletteDrag = () => { paletteDragRef.current = null; };

  const beginItemDrag = (event, item) => {
    if (event.target.closest('button, input, textarea')) return;
    event.preventDefault();
    event.stopPropagation();
    if (connectorMode) {
      setSelectedItemId(null);
      setSelectedRelationshipId(null);
      setConnectionStart(item.id);
      setConnectionPointer(canvasPoint(event));
      canvasRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (activeTool !== 'select') return;
    const point = canvasPoint(event);
    setSelectedItemId(item.id);
    setSelectedRelationshipId(null);
    setDragItem({ id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveItem = event => {
    if (!dragItem) return;
    const point = canvasPoint(event);
    setItems(current => current.map(item => item.id === dragItem.id
      ? { ...item, x: Math.max(0, point.x - dragItem.offsetX), y: Math.max(0, point.y - dragItem.offsetY) }
      : item));
  };

  const finishItemDrag = async () => {
    if (!dragItem) return;
    const moved = items.find(item => item.id === dragItem.id);
    setDragItem(null);
    if (moved) await updateProjectGroupItemAPI(moved.id, { x: moved.x, y: moved.y });
  };

  const updateItem = (itemId, changes) => setItems(current => current.map(item => item.id === itemId ? { ...item, ...changes } : item));

  const saveItem = async item => {
    await updateProjectGroupItemAPI(item.id, { title: item.title, content: item.content, width: item.width, height: item.height });
  };

  const saveGroupField = async (field, value) => {
    const nextDetails = { ...groupDetails, [field]: value };
    setGroupDetails(nextDetails);
    await updateProjectGroupAPI(group.id, { [field]: value });
  };

  const saveProjectCardField = async (item, field, value) => {
    const localField = field === 'title' ? 'projectTitle' : 'projectDescription';
    updateItem(item.id, { [localField]: value });
    await updateProjectAPI(item.project, { [field]: value });
  };

  const removeItem = async item => {
    await deleteProjectGroupItemAPI(item.id);
    setItems(current => current.filter(candidate => candidate.id !== item.id));
    setRelationships(current => current.filter(link => link.source !== item.id && link.target !== item.id));
    setSelectedItemId(null);
  };

  const removeRelationship = async relationship => {
    await deleteProjectGroupRelationshipAPI(relationship.id);
    setRelationships(current => current.filter(link => link.id !== relationship.id));
    setSelectedRelationshipId(null);
  };

  const updateRelationshipType = async type => {
    if (!selectedRelationship) return;
    setRelationships(current => current.map(link => link.id === selectedRelationship.id ? { ...link, relationship_type: type } : link));
    await updateProjectGroupRelationshipAPI(selectedRelationship.id, { relationship_type: type });
  };

  return (
    <section ref={editorRef} className={`project-group-editor ${connectorMode ? 'connector-mode' : ''}`} onPointerMove={movePalette} onPointerUp={stopPaletteDrag}>
      <button className="floating-project-back" type="button" aria-label="Back to project groups" title="Back to project groups" onClick={onBack}>×</button>
      <div className="group-canvas-scroll">
        <div ref={canvasRef} className={`group-canvas ${activeTool !== 'select' ? 'is-drawing' : ''}`} onDragOver={event => event.preventDefault()} onDrop={dropProject} onPointerDown={startAnnotation} onPointerMove={event => { moveAnnotation(event); moveItem(event); moveConnection(event); }} onPointerUp={event => { finishAnnotation(); finishItemDrag(); finishConnection(event); }} onPointerCancel={() => { setConnectionStart(null); setConnectionPointer(null); finishItemDrag(); }}>
          <svg className="group-canvas-grid" aria-hidden="true"><defs><pattern id="group-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="var(--canvas-line)" strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill="url(#group-grid)" /></svg>
          <svg className="group-canvas-edges" aria-hidden="true">
            <defs>
              <marker id="group-connection-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" /></marker>
              <marker id="group-connection-arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M 8 0 L 0 4 L 8 8 z" fill="context-stroke" /></marker>
            </defs>
            {relationships.map(link => {
              const source = items.find(item => item.id === link.source);
              const target = items.find(item => item.id === link.target);
              if (!source || !target) return null;
              const x1 = source.x + source.width / 2;
              const y1 = source.y + source.height / 2;
              const x2 = target.x + target.width / 2;
              const y2 = target.y + target.height / 2;
              return <g key={link.id} className="group-connection" onClick={event => { event.stopPropagation(); setSelectedRelationshipId(link.id); setSelectedItemId(null); }}>
                <line className="group-connection-hitbox" x1={x1} y1={y1} x2={x2} y2={y2} />
                <line className={`group-connection-line edge-${link.relationship_type || 'directional'} ${selectedRelationshipId === link.id ? 'selected' : ''}`} x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={link.relationship_type === 'loose' ? undefined : 'url(#group-connection-arrow)'} markerStart={link.relationship_type === 'bidirectional' ? 'url(#group-connection-arrow-start)' : undefined} />
              </g>;
            })}
            {connectionStart && connectionPointer && (() => {
              const source = items.find(item => item.id === connectionStart);
              if (!source) return null;
              const previewType = relationshipTypes.find(type => type.value === relationshipType);
              return <line className={`group-connection-preview edge-${relationshipType}`} x1={source.x + source.width / 2} y1={source.y + source.height / 2} x2={connectionPointer.x} y2={connectionPointer.y} markerEnd={relationshipType === 'loose' ? undefined : 'url(#group-connection-arrow)'} markerStart={relationshipType === 'bidirectional' ? 'url(#group-connection-arrow-start)' : undefined} aria-label={previewType?.label} />;
            })()}
          </svg>
          {items.map(item => item.item_type === 'project' ? <article data-group-item-id={item.id} key={item.id} className={`group-project-card ${selectedItemId === item.id ? 'selected' : ''} ${connectionStart === item.id ? 'connection-source' : ''}`} style={{ left: item.x, top: item.y, width: item.width, minHeight: item.height }} onPointerDown={event => beginItemDrag(event, item)} onClick={() => { if (!connectorMode) { setSelectedItemId(item.id); setSelectedRelationshipId(null); } }}>
            <span className="eyebrow">Project</span><strong>{item.projectTitle || item.title}</strong><p>{item.projectDescription}</p>
          </article> : item.item_type === 'text' ? <article data-group-item-id={item.id} key={item.id} className={`group-text-annotation ${selectedItemId === item.id ? 'selected' : ''} ${connectionStart === item.id ? 'connection-source' : ''}`} style={{ left: item.x, top: item.y, width: item.width, minHeight: item.height }} onPointerDown={event => beginItemDrag(event, item)} onClick={() => { if (!connectorMode) { setSelectedItemId(item.id); setSelectedRelationshipId(null); } }}>
            <strong>{item.title || 'Text note'}</strong><p>{item.content || 'Select to edit this note.'}</p>
          </article> : <div data-group-item-id={item.id} key={item.id} className={`group-shape-annotation shape-${item.shape_type} ${selectedItemId === item.id ? 'selected' : ''} ${connectionStart === item.id ? 'connection-source' : ''}`} style={{ left: item.x, top: item.y, width: item.width, height: item.height }} onPointerDown={event => beginItemDrag(event, item)} onClick={() => { if (!connectorMode) { setSelectedItemId(item.id); setSelectedRelationshipId(null); } }}><span>{item.content || item.title}</span></div>)}
          {draft && <div className={`group-shape-annotation shape-${draft.shapeType} is-draft`} style={{ left: Math.min(draft.startX, draft.currentX), top: Math.min(draft.startY, draft.currentY), width: Math.max(120, Math.abs(draft.currentX - draft.startX)), height: Math.max(76, Math.abs(draft.currentY - draft.startY)) }} />}
        </div>
      </div>
      <aside ref={paletteRef} className={`floating-project-palette ${paletteMinimized ? 'is-minimized' : ''}`} style={{ left: palettePosition.x, top: palettePosition.y }}>
        <div className="floating-panel-header" onPointerDown={startPaletteDrag}><span>{connectorMode ? 'Edge type' : 'Insert'}</span><button type="button" aria-label={paletteMinimized ? 'Expand palette' : 'Minimize palette'} onPointerDown={event => event.stopPropagation()} onClick={() => setPaletteMinimized(value => !value)}>{paletteMinimized ? '+' : '−'}</button></div>
        {!paletteMinimized && <>
          {connectorMode ? <fieldset className="group-edge-type-picker"><legend>Relationship type</legend><RelationshipTypeList value={relationshipType} onChange={setRelationshipType} /></fieldset> : <>
            <div className="project-palette-tabs"><button className={`project-palette-tab ${paletteTab === 'projects' ? 'active' : ''}`} type="button" onClick={() => setPaletteTab('projects')}>Projects</button><button className={`project-palette-tab ${paletteTab === 'annotations' ? 'active' : ''}`} type="button" onClick={() => setPaletteTab('annotations')}>Draw</button></div>
            {paletteTab === 'projects' ? <div className="floating-palette-list">
            {availableProjects.map(project => <button className="floating-palette-item" key={project.id} type="button" draggable onDragStart={event => event.dataTransfer.setData('application/project-group-project', String(project.id))} onClick={() => addCanvasItem({ item_type: 'project', project: project.id, title: project.title, x: 300 + (items.length % 2) * 250, y: 60 + Math.floor(items.length / 2) * 180, width: 220, height: 140, order: items.length })}><span>▣</span><strong>{project.title}</strong></button>)}
            {!availableProjects.length && <p className="floating-palette-empty">No projects to insert.</p>}
          </div> : <div className="floating-palette-list">
            {annotationTools.map(tool => <button key={tool.id} className={`floating-palette-item ${activeTool === tool.id ? 'active' : ''}`} type="button" onClick={() => { setActiveTool(tool.id); setConnectorMode(false); }}><span>{tool.icon}</span><strong>{tool.label}</strong></button>)}
          </div>}
          </>}
        </>}
      </aside>
      <aside className={`diagram-inspector group-item-inspector ${inspectorMinimized ? 'is-minimized' : ''}`}>
        <div className="floating-panel-header"><span>Inspector</span><button type="button" aria-label={inspectorMinimized ? 'Expand inspector' : 'Minimize inspector'} onClick={() => setInspectorMinimized(value => !value)}>{inspectorMinimized ? '+' : '−'}</button></div>
        {!inspectorMinimized && <>
          {selectedRelationship ? <><span className="eyebrow">Connection</span><fieldset className="group-edge-type-picker"><legend>Relationship type</legend><RelationshipTypeList value={selectedRelationship.relationship_type || 'directional'} onChange={updateRelationshipType} /></fieldset><button className="delete-button" type="button" onClick={() => removeRelationship(selectedRelationship)}>Delete connection</button></> : selected?.item_type === 'project' ? <>
            <span className="eyebrow">Project card</span><label>Title<input value={selected.projectTitle || selected.title} onChange={event => updateItem(selected.id, { projectTitle: event.target.value })} onBlur={event => saveProjectCardField(selected, 'title', event.target.value)} /></label><label>Description<textarea value={selected.projectDescription || ''} onChange={event => updateItem(selected.id, { projectDescription: event.target.value })} onBlur={event => saveProjectCardField(selected, 'description', event.target.value)} placeholder="Add a project description" /></label><button className="delete-button" type="button" onClick={() => removeItem(selected)}>Remove from group</button>
          </> : selected ? <>
            <span className="eyebrow">{selected.item_type === 'text' ? 'Text note' : 'Shape annotation'}</span>
            <label>Title<input value={selected.title} onChange={event => updateItem(selected.id, { title: event.target.value })} onBlur={() => saveItem(items.find(item => item.id === selected.id))} /></label>
            {selected.item_type === 'text' && <label>Text<textarea value={selected.content} onChange={event => updateItem(selected.id, { content: event.target.value })} onBlur={() => saveItem(items.find(item => item.id === selected.id))} placeholder="Write an annotation" /></label>}
            {selected.item_type === 'shape' && <label>Shape label<input value={selected.content} onChange={event => updateItem(selected.id, { content: event.target.value })} onBlur={() => saveItem(items.find(item => item.id === selected.id))} placeholder="Optional label" /></label>}
            <button type="button" className="delete-button" onClick={() => removeItem(selected)}>Remove annotation</button>
          </> : <><label>Title<input value={groupDetails.title} onChange={event => setGroupDetails(current => ({ ...current, title: event.target.value }))} onBlur={event => saveGroupField('title', event.target.value)} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} /></label><label>Description<textarea value={groupDetails.description} onChange={event => setGroupDetails(current => ({ ...current, description: event.target.value }))} onBlur={event => saveGroupField('description', event.target.value)} placeholder="Add a group description" /></label></>}
        </>}
      </aside>
      <button className={`connector-toggle ${connectorMode ? 'active' : ''}`} type="button" aria-pressed={connectorMode} onClick={() => { setConnectorMode(value => !value); setConnectionStart(null); setConnectionPointer(null); setActiveTool('select'); }}><span aria-hidden="true">＋</span><small>{connectorMode ? 'Exit connect' : 'Connect items'}</small></button>
    </section>
  );
}
