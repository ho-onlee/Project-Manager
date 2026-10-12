import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:8000/api', // Adjust if using a different port or path
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchColorSchemesAPI = () => API.get('/color-schemes/');
export const fetchColorSchemeSchemaAPI = () => API.get('/color-schemes/schema/');
export const fetchColorSchemeTemplateAPI = () => API.get('/color-schemes/template/');
export const fetchTools = () => API.get('/tools/');
export const createToolAPI = (toolData) => API.post('/tools/', toolData);
export const updateToolAPI = (id, toolData) => API.patch(`/tools/${id}/`, toolData);
export const deleteToolAPI = (id) => API.delete(`/tools/${id}/`);
export const fetchSkills = () => API.get('/skills/');
export const createSkillAPI = (skillData) => API.post('/skills/', skillData);
export const updateSkillAPI = (id, skillData) => API.patch(`/skills/${id}/`, skillData);
export const deleteSkillAPI = (id) => API.delete(`/skills/${id}/`);
export const fetchEnvironments = () => API.get('/environments/');
export const createEnvironmentAPI = environmentData => API.post('/environments/', environmentData);
export const updateEnvironmentAPI = (id, environmentData) => API.patch(`/environments/${id}/`, environmentData);
export const deleteEnvironmentAPI = id => API.delete(`/environments/${id}/`);
export const fetchProjects = () => API.get('/projects/');
export const createProjectAPI = projectData => API.post('/projects/', projectData);
export const updateProjectAPI = (id, projectData) => API.patch(`/projects/${id}/`, projectData);
export const fetchProjectGroupsAPI = () => API.get('/project-groups/');
export const createProjectGroupAPI = groupData => API.post('/project-groups/', groupData);
export const updateProjectGroupAPI = (id, groupData) => API.patch(`/project-groups/${id}/`, groupData);
export const deleteProjectGroupAPI = id => API.delete(`/project-groups/${id}/`);
export const createProjectGroupItemAPI = itemData => API.post('/project-group-items/', itemData);
export const updateProjectGroupItemAPI = (id, itemData) => API.patch(`/project-group-items/${id}/`, itemData);
export const deleteProjectGroupItemAPI = id => API.delete(`/project-group-items/${id}/`);
export const createProjectGroupRelationshipAPI = relationshipData => API.post('/project-group-relationships/', relationshipData);
export const updateProjectGroupRelationshipAPI = (id, relationshipData) => API.patch(`/project-group-relationships/${id}/`, relationshipData);
export const deleteProjectGroupRelationshipAPI = id => API.delete(`/project-group-relationships/${id}/`);
export const generateProjectReportAPI = (id, projectJson, prompt) => API.post(`/projects/${id}/generate-report/`, { project_json: projectJson, prompt });
export const fetchGeminiSettingsAPI = () => API.get('/settings/gemini/');
export const saveGeminiSettingsAPI = apiKey => API.post('/settings/gemini/', { api_key: apiKey });
export const deleteGeminiSettingsAPI = () => API.delete('/settings/gemini/');
export const testGeminiSettingsAPI = () => API.post('/settings/gemini/test/');
export const createProjectNodeAPI = nodeData => API.post('/project-nodes/', nodeData);
export const updateProjectNodeAPI = (id, nodeData) => API.patch(`/project-nodes/${id}/`, nodeData);
export const deleteProjectNodeAPI = id => API.delete(`/project-nodes/${id}/`);
export const createProjectRelationshipAPI = relationshipData => API.post('/project-relationships/', relationshipData);
export const deleteProjectRelationshipAPI = id => API.delete(`/project-relationships/${id}/`);