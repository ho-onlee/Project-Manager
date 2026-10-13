import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

API.interceptors.request.use(config => {
  const workspaceId = window.localStorage.getItem('projectnote-active-workspace');
  if (workspaceId) config.headers.set('X-Workspace-ID', workspaceId);
  const geminiWorkspaceId = window.localStorage.getItem('projectnote-gemini-workspace');
  if (geminiWorkspaceId) config.headers.set('X-Gemini-Key-Workspace-ID', geminiWorkspaceId);
  const method = (config.method || 'get').toLowerCase();
  const csrfCookie = document.cookie.split('; ').find(cookie => cookie.startsWith('csrftoken='))?.slice('csrftoken='.length);
  if (csrfCookie && !['get', 'head', 'options', 'trace'].includes(method)) config.headers.set('X-CSRFToken', decodeURIComponent(csrfCookie));
  return config;
});

export const fetchAuthCsrfAPI = () => API.get('/auth/csrf/');
export const fetchAuthSessionAPI = () => API.get('/auth/session/');
export const registerAPI = accountData => API.post('/auth/register/', accountData);
export const loginAPI = credentials => API.post('/auth/login/', credentials);
export const googleLoginAPI = (credential, teamId) => API.post('/auth/google/', { credential, ...(teamId ? { teamId } : {}) });
export const logoutAPI = () => API.delete('/auth/session/');
export const fetchTeamsForSignupAPI = () => API.get('/auth/teams/');
export const fetchWorkspacesAPI = () => API.get('/workspaces/');
export const fetchUserPreferencesAPI = () => API.get('/preferences/');
export const updateUserPreferencesAPI = preferences => API.patch('/preferences/', preferences);
export const createWorkspaceAPI = name => API.post('/workspaces/', { name });
export const requestWorkspaceAccessAPI = workspaceId => API.post(`/workspaces/${workspaceId}/request-access/`);
export const deleteWorkspaceAPI = workspaceId => API.delete(`/workspaces/${workspaceId}/`);
export const fetchWorkspaceUsersAPI = (workspaceId, query = '') => API.get(`/workspaces/${workspaceId}/users/`, { params: { q: query } });
export const fetchWorkspaceMembersAPI = workspaceId => API.get(`/workspaces/${workspaceId}/members/`);
export const addWorkspaceMemberAPI = (workspaceId, userId) => API.post(`/workspaces/${workspaceId}/members/`, { userId });
export const removeWorkspaceMemberAPI = (workspaceId, userId) => API.delete(`/workspaces/${workspaceId}/members/`, { params: { userId } });
export const fetchWorkspaceCardAssignmentsAPI = (workspaceId, cardType, cardId) => API.get(`/workspaces/${workspaceId}/assignments/${cardType}/${cardId}/`);
export const updateWorkspaceCardAssignmentsAPI = (workspaceId, cardType, cardId, userIds) => API.put(`/workspaces/${workspaceId}/assignments/${cardType}/${cardId}/`, { userIds });

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
export const updateSharedCardAPI = (resourcePath, id, sharedWith) => API.patch(`/${resourcePath}/${id}/`, { shared_with: sharedWith });