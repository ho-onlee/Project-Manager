from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuthSessionView, ColorSchemeSchemaView, ColorSchemeTemplateView, ColorSchemesView, CsrfTokenView, EdgeViewSet, EnvironmentViewSet, GeminiKeyTestView, GeminiSettingsView, GoogleSignInView, LoginView, NodeViewSet, ProjectGroupItemViewSet, ProjectGroupRelationshipViewSet, ProjectGroupViewSet, ProjectNodeViewSet, ProjectRelationshipViewSet, ProjectViewSet, PublicTeamListView, RegisterView, SkillViewSet, ToolViewSet, UserPreferencesView, WorkspaceCardAssignmentsView, WorkspaceDetailView, WorkspaceJoinRequestView, WorkspaceListView, WorkspaceMembersView, WorkspaceUsersView

# The router automatically generates standard REST URLs
router = DefaultRouter()
router.register(r'nodes', NodeViewSet)
router.register(r'edges', EdgeViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'project-groups', ProjectGroupViewSet)
router.register(r'project-group-items', ProjectGroupItemViewSet)
router.register(r'project-group-relationships', ProjectGroupRelationshipViewSet)
router.register(r'project-nodes', ProjectNodeViewSet)
router.register(r'project-relationships', ProjectRelationshipViewSet)
router.register(r'skills', SkillViewSet)
router.register(r'tools', ToolViewSet)
router.register(r'environments', EnvironmentViewSet)

urlpatterns = [
    path('auth/csrf/', CsrfTokenView.as_view(), name='auth-csrf'),
    path('auth/session/', AuthSessionView.as_view(), name='auth-session'),
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/google/', GoogleSignInView.as_view(), name='auth-google'),
    path('auth/teams/', PublicTeamListView.as_view(), name='auth-teams'),
    path('preferences/', UserPreferencesView.as_view(), name='user-preferences'),
    path('workspaces/', WorkspaceListView.as_view(), name='workspace-list'),
    path('workspaces/<uuid:workspace_id>/', WorkspaceDetailView.as_view(), name='workspace-detail'),
    path('workspaces/<uuid:workspace_id>/request-access/', WorkspaceJoinRequestView.as_view(), name='workspace-request-access'),
    path('workspaces/<uuid:workspace_id>/users/', WorkspaceUsersView.as_view(), name='workspace-users'),
    path('workspaces/<uuid:workspace_id>/members/', WorkspaceMembersView.as_view(), name='workspace-members'),
    path('workspaces/<uuid:workspace_id>/assignments/<str:card_type>/<uuid:card_id>/', WorkspaceCardAssignmentsView.as_view(), name='workspace-card-assignments'),
    path('color-schemes/schema/', ColorSchemeSchemaView.as_view(), name='color-scheme-schema'),
    path('color-schemes/template/', ColorSchemeTemplateView.as_view(), name='color-scheme-template'),
    path('color-schemes/', ColorSchemesView.as_view(), name='color-schemes'),
    path('settings/gemini/test/', GeminiKeyTestView.as_view(), name='gemini-settings-test'),
    path('settings/gemini/', GeminiSettingsView.as_view(), name='gemini-settings'),
    path('', include(router.urls)),
]