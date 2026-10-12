from django.contrib import admin
from .models import Skill, Tool, Workspace, WorkspaceMembership

admin.site.register(Skill)
admin.site.register(Tool)


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
	list_display = ('name', 'workspace_type', 'created_by', 'created_at')
	list_filter = ('workspace_type',)
	search_fields = ('name', 'created_by__email')


@admin.register(WorkspaceMembership)
class WorkspaceMembershipAdmin(admin.ModelAdmin):
	list_display = ('workspace', 'user', 'role', 'status', 'created_at')
	list_filter = ('role', 'status', 'workspace__workspace_type')
	search_fields = ('workspace__name', 'user__email', 'user__username')
