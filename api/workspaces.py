from django.core.exceptions import PermissionDenied
from django.db.models import Q
from rest_framework import viewsets

from .models import Workspace, WorkspaceMembership


def visible_workspaces(user):
    return Workspace.objects.filter(
        memberships__user=user,
        memberships__status=WorkspaceMembership.ACTIVE,
    ).distinct()


def get_active_workspace(request):
    memberships = WorkspaceMembership.objects.filter(
        user=request.user,
        status=WorkspaceMembership.ACTIVE,
        workspace__workspace_type__in=('personal', 'team'),
    ).select_related('workspace')
    workspace_id = request.headers.get('X-Workspace-ID')
    if workspace_id:
        membership = memberships.filter(workspace_id=workspace_id).first()
        if membership is None:
            raise PermissionDenied('You do not have access to that workspace.')
        return membership.workspace

    membership = memberships.filter(workspace__workspace_type='personal').first() or memberships.first()
    if membership is None:
        raise PermissionDenied('This account has no active workspace.')
    return membership.workspace


class WorkspaceScopedViewSet(viewsets.ModelViewSet):
    workspace_lookup = 'workspace'
    shared_workspace_lookup = 'shared_with'

    def get_active_workspace(self):
        if not hasattr(self, '_active_workspace'):
            self._active_workspace = get_active_workspace(self.request)
        return self._active_workspace

    def get_queryset(self):
        queryset = super().get_queryset()
        workspace = self.get_active_workspace()
        workspace_filter = Q(**{self.workspace_lookup: workspace})
        if self.shared_workspace_lookup:
            workspace_filter |= Q(**{self.shared_workspace_lookup: workspace})
        return queryset.filter(workspace_filter).distinct()

    def perform_create(self, serializer):
        model_fields = {field.name for field in serializer.Meta.model._meta.get_fields()}
        if 'workspace' in model_fields and 'workspace' not in serializer.validated_data:
            serializer.save(workspace=self.get_active_workspace())
        else:
            serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        workspace_field = getattr(instance, 'workspace_id', None)
        is_owner_workspace = not workspace_field or workspace_field == self.get_active_workspace().id
        shared_field = getattr(instance, 'shared_with', None)
        requested_shares = serializer.validated_data.get('shared_with')
        if not is_owner_workspace and requested_shares is not None:
            raise PermissionDenied('Only the owning workspace can change card sharing.')
        if shared_field is not None and requested_shares is not None:
            allowed = set(visible_workspaces(self.request.user).filter(workspace_type=Workspace.TEAM).values_list('id', flat=True))
            if any(workspace.workspace_type != Workspace.TEAM or workspace.id not in allowed for workspace in requested_shares):
                raise PermissionDenied('Cards can only be shared with teams you actively belong to.')
        serializer.save()
