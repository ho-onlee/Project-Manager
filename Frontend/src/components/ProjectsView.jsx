import React, { useEffect, useState } from 'react';
import { createProjectAPI, fetchProjects, generateProjectReportAPI, updateSharedCardAPI } from '../api';
import CardActions from './CardActions';
import FloatingAction from './FloatingAction';
import ProjectModal from './ProjectModal';
import ProjectDiagram from './ProjectDiagram';
import ProjectReportReader from './ProjectReportReader';
import ReportDataPreview from './ReportDataPreview';
import CatalogSearch from './CatalogSearch';
import { readReportPrompt } from '../reportPrompt';
import { readReviewReportData } from '../accessibilitySettings';
import useCreatedCardAnimation from './useCreatedCardAnimation';

export default function ProjectsView({ teams = [], activeWorkspaceId }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [pendingReport, setPendingReport] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [generatingReportId, setGeneratingReportId] = useState(null);
  const [error, setError] = useState('');
  const { createdCardIds, highlightCreatedCard } = useCreatedCardAnimation('projects');

  const loadProjects = async () => {
    try {
      const response = await fetchProjects();
      setProjects(response.data);
      setError('');
    } catch {
      setError('The project library could not be reached. Start Django on port 8000.');
    }
  };

  useEffect(() => { loadProjects(); }, []);

  const createProject = async values => {
    try {
      const response = await createProjectAPI(values);
      setProjects(current => [response.data, ...current]);
      setModalOpen(false);
      setSearchQuery('');
      highlightCreatedCard(response.data.id);
    } catch {
      setError('Project could not be created.');
    }
  };

  const shareProject = async (project, teamId, shouldShare) => {
    const sharedWith = new Set((project.shared_with || []).map(String));
    if (shouldShare) sharedWith.add(String(teamId)); else sharedWith.delete(String(teamId));
    const response = await updateSharedCardAPI('projects', project.id, [...sharedWith]);
    setProjects(current => current.map(item => item.id === project.id ? response.data : item));
  };

  const projectToJSON = project => {
    const cleanNode = node => ({
      id: node.id,
      title: node.title,
      description: node.node_type === 'text' || node.node_type === 'list' ? node.description || node.content || '' : node.description,
      type: node.node_type,
      order: node.order,
      is_project_root: node.is_project_root,
      ...(node.node_type === 'image' ? { content: node.content || node.description || '', image_url: node.image_url } : {}),
      ...(node.node_type === 'list' ? {
        list_style: node.list_style,
      } : node.node_type !== 'image' && node.node_type !== 'text' ? { content: node.content || '' } : {}),
      children: [...(node.children || [])].sort((a, b) => a.order - b.order).map(cleanNode)
    });
    return {
      project: {
        id: project.id,
        title: project.title,
        description: project.description
      },
      nodes: [...(project.nodes || [])].sort((a, b) => a.order - b.order).map(cleanNode),
      relationships: project.relationships || []
    };
  };

  const projectToReportJSON = project => {
    const projectJson = projectToJSON(project);
    const omitImageData = node => {
      const reportNode = { ...node, children: (node.children || []).map(omitImageData) };
      delete reportNode.image_url;
      return reportNode;
    };
    return { ...projectJson, nodes: projectJson.nodes.map(omitImageData) };
  };

  const downloadProject = (event, project) => {
    event.stopPropagation();
    const projectJson = projectToJSON(project);
    const blob = new Blob([JSON.stringify(projectJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sendReportRequest = async (project, payload) => {
    setGeneratingReportId(project.id);
    setError('');
    try {
      const response = await generateProjectReportAPI(project.id, payload.project_json, payload.prompt);
      setActiveReport({ projectTitle: project.title, markdown: response.data.report });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Report generation failed. Check Settings and try again.');
    } finally {
      setGeneratingReportId(null);
    }
  };

  const generateReport = (event, project) => {
    event.stopPropagation();
    const payload = { project_json: projectToReportJSON(project), prompt: readReportPrompt() };
    if (readReviewReportData()) {
      setPendingReport({ project, payload });
      return;
    }
    sendReportRequest(project, payload);
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredProjects = projects.filter(project => !query || [project.title, project.description].some(value => String(value || '').toLowerCase().includes(query)));

  if (activeReport) {
    return <ProjectReportReader {...activeReport} onBack={() => setActiveReport(null)} />;
  }

  if (activeProject) {
    return <ProjectDiagram project={activeProject} onBack={() => { setActiveProject(null); loadProjects(); }} />;
  }

  return (
    <section className="catalog-view projects-view">
      <CatalogSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search projects" />
      {error && <p className="project-error">{error}</p>}
      <div className="project-card-grid">
        {filteredProjects.map(project => (
          <article id={`projects-card-${project.id}`} className={`project-card ${createdCardIds.has(String(project.id)) ? 'is-highlighted' : ''}`} key={project.id} onDoubleClick={() => setActiveProject(project)}>
            <CardActions name={project.title} shareOnly shareable={project.workspace === activeWorkspaceId} teams={project.workspace === activeWorkspaceId ? teams : []} sharedWith={(project.shared_with || []).map(String)} onShareChange={(teamId, shouldShare) => shareProject(project, teamId, shouldShare)} />
            <div className="card-kicker"><span>Project</span><span>{project.nodes?.length || 0} roots</span></div>
            <h2>{project.title}</h2>
            <p>{project.description || 'No description yet.'}</p>
            <button className="text-action" type="button" onClick={() => setActiveProject(project)}>Open diagram <span aria-hidden="true">↗</span></button>
            <div className="project-card-actions">
              <button className="project-action-button" type="button" aria-label={`Download ${project.title} JSON`} title="Download project JSON" onClick={event => downloadProject(event, project)}>↓ Download JSON</button>
              <button className="project-action-button generate-report-button" type="button" disabled={generatingReportId === project.id} onClick={event => generateReport(event, project)}>{generatingReportId === project.id ? 'Generating…' : '✧ Generate report'}</button>
            </div>
          </article>
        ))}
        {!filteredProjects.length && !error && <div className="project-empty">{query ? `No projects match "${searchQuery.trim()}".` : 'Your first project will appear here.'}</div>}
      </div>
      {modalOpen && <ProjectModal onClose={() => setModalOpen(false)} onSave={createProject} />}
      {pendingReport && <ReportDataPreview payload={pendingReport.payload} onCancel={() => setPendingReport(null)} onSend={() => { const { project, payload } = pendingReport; setPendingReport(null); sendReportRequest(project, payload); }} />}
      <FloatingAction activeView="projects" onClick={() => setModalOpen(true)} />
    </section>
  );
}
