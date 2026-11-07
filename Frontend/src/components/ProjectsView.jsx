import React, { useEffect, useState } from 'react';
import { applyProjectPlanAPI, createProjectAPI, fetchGeminiSettingsAPI, fetchProjects, fetchProjectPlanHistoryAPI, generateProjectReportAPI, updateSharedCardAPI } from '../api';
import CardActions from './CardActions';
import FloatingAction from './FloatingAction';
import ProjectModal from './ProjectModal';
import ProjectDiagram from './ProjectDiagram';
import ProjectReportReader from './ProjectReportReader';
import ReportDataPreview from './ReportDataPreview';
import ProjectAssigneePicker from './ProjectAssigneePicker';
import CatalogSearch from './CatalogSearch';
import useCreatedCardAnimation from './useCreatedCardAnimation';

function parseResearchPlan(value) {
  const plan = JSON.parse(value);
  if (plan?.format !== 'projectnote-research-plan-v1' || !Array.isArray(plan.nodes) || !Array.isArray(plan.relationships) || !Array.isArray(plan.questions)) {
    throw new Error('Gemini returned JSON that does not match the research plan format.');
  }
  return plan;
}

function researchPlanMarkdown(plan, projectJson) {
  const sections = [`# ${plan.title}`, plan.summary || '', '## Research flow'];
  const resourcesById = new Map();
  const collectResources = nodes => (nodes || []).forEach(node => {
    if (['tool', 'skill', 'environment'].includes(node.type || node.node_type)) resourcesById.set(String(node.id), `${node.title} (${node.type || node.node_type})`);
    collectResources(node.children);
  });
  collectResources(projectJson?.nodes);
  if (plan.questions.length) {
    sections.push('## Questions to resolve', ...plan.questions.map(item => `- ${item.question}${item.reason ? ` (${item.reason})` : ''}`));
  }
  plan.nodes.forEach((node, index) => {
    sections.push(`${node.parent_key ? '###' : '##'} ${index + 1}. ${node.title}`, node.description || '');
    const resourceNames = (node.resource_ids || []).map(id => resourcesById.get(String(id))).filter(Boolean);
    if (resourceNames.length) sections.push(`**Available resources:** ${resourceNames.join(', ')}`);
  });
  if (plan.human_subjects && plan.ethics_checks?.length) {
    sections.push('## Human-subject safeguards', ...plan.ethics_checks.map(item => `- ${item}`));
  }
  if (plan.relationships.length) {
    const titles = new Map(plan.nodes.map(node => [node.key, node.title]));
    sections.push('## Dependencies');
    plan.relationships.forEach(link => sections.push(`- ${titles.get(link.source_key) || link.source_key} → ${titles.get(link.target_key) || link.target_key}${link.label ? ` (${link.label})` : ''}`));
  }
  return sections.filter(Boolean).join('\n\n');
}

export default function ProjectsView({ teams = [], activeWorkspaceId, canManageAssignments = false, reportPrompt, reviewReportData = true }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [pendingReport, setPendingReport] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [generatingReportId, setGeneratingReportId] = useState(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [planApplyError, setPlanApplyError] = useState('');
  const [geminiConfigured, setGeminiConfigured] = useState(null);
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

  useEffect(() => {
    setGeminiConfigured(null);
    fetchGeminiSettingsAPI().then(response => setGeminiConfigured(Boolean(response.data.configured))).catch(() => setGeminiConfigured(false));
  }, [activeWorkspaceId]);

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
    return projectToJSON(project);
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
    setPlanApplyError('');
    try {
      const response = await generateProjectReportAPI(project.id, payload.project_json, payload.prompt, {
        clarifications: payload.clarifications || [],
        force: Boolean(payload.force),
      });
      const plan = parseResearchPlan(response.data.report);
      setActiveReport({
        projectTitle: project.title,
        markdown: researchPlanMarkdown(plan, payload.project_json),
        plan,
        planJson: `${JSON.stringify(plan, null, 2)}\n`,
        planVersionId: response.data.planVersionId,
        planAppliedAt: response.data.appliedAt,
        generatedAt: response.data.createdAt || new Date().toISOString(),
        project,
        payload,
      });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Research plan generation failed. Check Settings and try again.');
    } finally {
      setGeneratingReportId(null);
    }
  };

  const applyPlanToProject = async plan => {
    setApplyingPlan(true);
    setPlanApplyError('');
    try {
      const response = await applyProjectPlanAPI(activeReport.project.id, plan);
      setActiveReport(null);
      setActiveProject(response.data.project);
    } catch (requestError) {
      setPlanApplyError(requestError.response?.data?.detail || 'The plan could not be added. Check that the JSON belongs to this project and follows the plan format.');
    } finally {
      setApplyingPlan(false);
    }
  };

  const openPlanVersion = version => {
    const plan = version.plan_json;
    const sourceProject = version.source_project_json;
    setActiveReport(current => ({
      ...current,
      projectTitle: sourceProject?.project?.title || current.projectTitle,
      markdown: researchPlanMarkdown(plan, sourceProject),
      plan,
      planJson: `${JSON.stringify(plan, null, 2)}\n`,
      planVersionId: version.id,
      planAppliedAt: version.applied_at,
      generatedAt: version.created_at,
      payload: {
        project_json: sourceProject,
        prompt: version.prompt || current.payload.prompt,
        clarifications: version.clarifications || [],
        force: true,
      },
    }));
  };

  const generateReport = (event, project) => {
    event.stopPropagation();
    const payload = { project_json: projectToReportJSON(project), prompt: reportPrompt, clarifications: [], force: false };
    if (reviewReportData) {
      setPendingReport({ project, payload });
      return;
    }
    sendReportRequest(project, payload);
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredProjects = projects.filter(project => !query || [project.title, project.description].some(value => String(value || '').toLowerCase().includes(query)));

  if (activeReport) {
    return <ProjectReportReader
      key={activeReport.planVersionId || activeReport.generatedAt}
      {...activeReport}
      isRegenerating={Boolean(generatingReportId)}
      generationError={error}
      applyingPlan={applyingPlan}
      applyError={planApplyError}
      onBack={() => setActiveReport(null)}
      onRegenerate={() => sendReportRequest(activeReport.project, { ...activeReport.payload, force: true })}
      onApplyPlan={() => applyPlanToProject(activeReport.plan)}
      onAnswerQuestions={clarifications => sendReportRequest(activeReport.project, { ...activeReport.payload, clarifications, force: true })}
      onLoadHistory={async () => (await fetchProjectPlanHistoryAPI(activeReport.project.id)).data}
      onOpenHistoryVersion={openPlanVersion}
    />;
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
              <button className="project-action-button generate-report-button" type="button" disabled={generatingReportId === project.id || geminiConfigured === false} title={geminiConfigured === false ? 'Add a Gemini API key in Settings to enable research plans.' : undefined} onClick={event => generateReport(event, project)}>{generatingReportId === project.id ? 'Planning…' : '✧ Generate research plan'}</button>
              {canManageAssignments && <ProjectAssigneePicker project={project} workspaceId={activeWorkspaceId} />}
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
