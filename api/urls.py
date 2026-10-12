from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ColorSchemeSchemaView, ColorSchemeTemplateView, ColorSchemesView, EdgeViewSet, EnvironmentViewSet, GeminiKeyTestView, GeminiSettingsView, NodeViewSet, ProjectGroupItemViewSet, ProjectGroupRelationshipViewSet, ProjectGroupViewSet, ProjectNodeViewSet, ProjectRelationshipViewSet, ProjectViewSet, SkillViewSet, ToolViewSet

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
    path('color-schemes/schema/', ColorSchemeSchemaView.as_view(), name='color-scheme-schema'),
    path('color-schemes/template/', ColorSchemeTemplateView.as_view(), name='color-scheme-template'),
    path('color-schemes/', ColorSchemesView.as_view(), name='color-schemes'),
    path('settings/gemini/test/', GeminiKeyTestView.as_view(), name='gemini-settings-test'),
    path('settings/gemini/', GeminiSettingsView.as_view(), name='gemini-settings'),
    path('', include(router.urls)),
]