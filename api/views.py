import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, password_validation
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import status, viewsets
from django.db.models import Count, Max, Q
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import AccountProfile, Environment, Node, Edge, Project, ProjectNode, ProjectRelationship, ProjectGroup, ProjectGroupItem, ProjectGroupRelationship, Skill, Tool, UserPreferences, WorkspaceCardAssignment, WorkspaceGeminiCredential
from .gemini import GeminiConfigurationError, GeminiGenerationError, GeminiInputTooLargeError, clear_gemini_api_key_validation, delete_gemini_api_key, generate_project_report, get_gemini_api_key, get_gemini_key_source, is_gemini_api_key_validated, mark_gemini_api_key_validated, project_report_fingerprint, store_gemini_api_key, test_gemini_api_key
from .serializers import EnvironmentSerializer, FlatNodeSerializer, GeminiSettingsSerializer, GenerateProjectReportSerializer, NestedNodeSerializer, EdgeSerializer, ProjectGroupItemSerializer, ProjectGroupRelationshipSerializer, ProjectGroupSerializer, ProjectNodeSerializer, ProjectRelationshipSerializer, ProjectSerializer, SkillSerializer, ToolSerializer
from .models import Workspace, WorkspaceMembership
from .workspaces import WorkspaceScopedViewSet, get_active_workspace


def invalidate_project_report_cache(project_id):
    cache.delete(f'project-report:{project_id}')


def gemini_settings_payload(workspace_id, source=None):
    source = source if source is not None else get_gemini_key_source(workspace_id)
    return {
        'configured': source is not None,
        'validated': is_gemini_api_key_validated(workspace_id),
        'model': settings.GEMINI_MODEL,
        'source': source,
        'workspaceId': str(workspace_id),
    }


def get_gemini_workspace(request, require_admin=False):
    workspace_id = request.headers.get('X-Gemini-Key-Workspace-ID')
    workspace = get_active_workspace(request) if not workspace_id else Workspace.objects.filter(id=workspace_id).first()
    if workspace is None or not WorkspaceMembership.objects.filter(user=request.user, workspace=workspace, status=WorkspaceMembership.ACTIVE).exists():
        raise PermissionDenied('Choose a workspace you actively belong to for Gemini credentials.')
    if require_admin and workspace.workspace_type == Workspace.TEAM and not WorkspaceMembership.objects.filter(
        user=request.user,
        workspace=workspace,
        status=WorkspaceMembership.ACTIVE,
        role__in=[WorkspaceMembership.OWNER, WorkspaceMembership.ADMIN],
    ).exists():
        raise PermissionDenied('Only team admins can manage the team Gemini key.')
    return workspace


def verify_google_identity(credential):
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token
    return id_token.verify_oauth2_token(credential, GoogleRequest(), settings.GOOGLE_OAUTH_CLIENT_ID)


def user_session_payload(user):
    memberships = WorkspaceMembership.objects.filter(user=user, status=WorkspaceMembership.ACTIVE).select_related('workspace')
    pending = WorkspaceMembership.objects.filter(user=user, status=WorkspaceMembership.PENDING, workspace__workspace_type=Workspace.TEAM).select_related('workspace')
    preferences, _ = UserPreferences.objects.get_or_create(user=user)
    return {
        'authenticated': True,
        'user': {'id': str(user.id), 'email': user.email, 'name': user.get_full_name() or user.email, 'isAdmin': user.is_staff},
        'emailVerified': bool(getattr(getattr(user, 'projectnote_profile', None), 'email_verified', False)),
        'workspaces': [
            {'id': str(item.workspace_id), 'name': item.workspace.name, 'type': item.workspace.workspace_type, 'role': item.role}
            for item in memberships
        ],
        'pendingTeams': [{'id': str(item.workspace_id), 'name': item.workspace.name} for item in pending],
        'geminiWorkspaceId': str(preferences.gemini_workspace_id) if preferences.gemini_workspace_id else None,
    }


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfTokenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'csrfToken': get_token(request)})


class AuthSessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'authenticated': False})
        return Response(user_session_payload(request.user))

    def delete(self, request):
        if request.user.is_authenticated:
            logout(request._request)
        return Response({'authenticated': False})


class UserPreferencesView(APIView):
    def get(self, request):
        preferences, _ = UserPreferences.objects.get_or_create(user=request.user)
        return Response({
            'selectedColorSchemeId': preferences.selected_color_scheme_id,
            'accessibility': preferences.accessibility,
            'reportPrompt': preferences.report_prompt,
            'reviewReportData': preferences.review_report_data,
            'geminiWorkspaceId': str(preferences.gemini_workspace_id) if preferences.gemini_workspace_id else None,
        })

    def patch(self, request):
        preferences, _ = UserPreferences.objects.get_or_create(user=request.user)
        allowed_fields = {
            'selectedColorSchemeId': 'selected_color_scheme_id',
            'accessibility': 'accessibility',
            'reportPrompt': 'report_prompt',
            'reviewReportData': 'review_report_data',
        }
        for api_field, model_field in allowed_fields.items():
            if api_field in request.data:
                value = request.data[api_field]
                if api_field == 'selectedColorSchemeId' and (not isinstance(value, str) or len(value) > 80):
                    return Response({api_field: ['Invalid color scheme id.']}, status=status.HTTP_400_BAD_REQUEST)
                if api_field == 'accessibility' and (not isinstance(value, dict) or len(value) > 10):
                    return Response({api_field: ['Invalid accessibility settings.']}, status=status.HTTP_400_BAD_REQUEST)
                if api_field == 'reportPrompt' and (not isinstance(value, str) or len(value) > 4000):
                    return Response({api_field: ['Report prompt must be 4000 characters or fewer.']}, status=status.HTTP_400_BAD_REQUEST)
                if api_field == 'reviewReportData' and not isinstance(value, bool):
                    return Response({api_field: ['Expected a boolean value.']}, status=status.HTTP_400_BAD_REQUEST)
                setattr(preferences, model_field, value)
        if 'geminiWorkspaceId' in request.data:
            workspace_id = request.data['geminiWorkspaceId']
            if workspace_id in (None, ''):
                preferences.gemini_workspace = None
            else:
                workspace = Workspace.objects.filter(id=workspace_id).first()
                if workspace is None or not WorkspaceMembership.objects.filter(user=request.user, workspace=workspace, status=WorkspaceMembership.ACTIVE).exists():
                    return Response({'geminiWorkspaceId': ['Choose a workspace you actively belong to.']}, status=status.HTTP_400_BAD_REQUEST)
                preferences.gemini_workspace = workspace
        preferences.save()
        return self.get(request)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        email = str(request.data.get('email', '')).strip().lower()
        password = str(request.data.get('password', ''))
        name = str(request.data.get('name', '')).strip()
        requested_team_id = request.data.get('teamId')
        if not email or '@' not in email:
            return Response({'email': ['Enter a valid email address.']}, status=status.HTTP_400_BAD_REQUEST)
        team = None
        if requested_team_id:
            team = Workspace.objects.filter(id=requested_team_id, workspace_type=Workspace.TEAM).first()
            if team is None:
                return Response({'teamId': ['That team is not available.']}, status=status.HTTP_400_BAD_REQUEST)
        user_model = get_user_model()
        if user_model.objects.filter(email__iexact=email).exists():
            return Response({'email': ['An account with this email already exists.']}, status=status.HTTP_400_BAD_REQUEST)
        user = user_model(username=email, email=email, first_name=name[:150])
        try:
            password_validation.validate_password(password, user=user)
        except DjangoValidationError as error:
            return Response({'password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save()
        personal_workspace = Workspace.objects.create(name='Personal', workspace_type=Workspace.PERSONAL, created_by=user)
        WorkspaceMembership.objects.create(workspace=personal_workspace, user=user, role=WorkspaceMembership.OWNER)
        if team:
            WorkspaceMembership.objects.create(workspace=team, user=user, role=WorkspaceMembership.MEMBER, status=WorkspaceMembership.PENDING)
        AccountProfile.objects.create(user=user, email_verified=True)
        return Response({'registered': True, 'email': email}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get('email', '')).strip().lower()
        password = str(request.data.get('password', ''))
        user_model = get_user_model()
        user = user_model.objects.filter(email__iexact=email, is_active=True).first()
        authenticated_user = authenticate(request=request._request, username=user.username if user else email, password=password)
        if authenticated_user is None:
            return Response({'detail': 'Email or password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        AccountProfile.objects.get_or_create(user=authenticated_user, defaults={'email_verified': True})
        login(request._request, authenticated_user)
        return Response(user_session_payload(authenticated_user))


class GoogleSignInView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            return Response({'detail': 'Google sign-in is not configured on this server.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        credential = str(request.data.get('credential', ''))
        if not credential:
            return Response({'detail': 'Google credential is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            claims = verify_google_identity(credential)
        except Exception:
            return Response({'detail': 'Google sign-in could not be verified.'}, status=status.HTTP_400_BAD_REQUEST)
        email = str(claims.get('email', '')).lower()
        if not email or not claims.get('email_verified'):
            return Response({'detail': 'Google must provide a verified email address.'}, status=status.HTTP_400_BAD_REQUEST)
        requested_team = None
        requested_team_id = request.data.get('teamId')
        if requested_team_id:
            requested_team = Workspace.objects.filter(id=requested_team_id, workspace_type=Workspace.TEAM).first()
            if requested_team is None:
                return Response({'teamId': ['That team is not available.']}, status=status.HTTP_400_BAD_REQUEST)
        user_model = get_user_model()
        user = user_model.objects.filter(email__iexact=email).first()
        if user is None:
            user = user_model.objects.create_user(
                username=email,
                email=email,
                first_name=str(claims.get('given_name', ''))[:150],
                last_name=str(claims.get('family_name', ''))[:150],
            )
            AccountProfile.objects.create(user=user, email_verified=True)
            personal_workspace = Workspace.objects.create(name='Personal', workspace_type=Workspace.PERSONAL, created_by=user)
            WorkspaceMembership.objects.create(workspace=personal_workspace, user=user, role=WorkspaceMembership.OWNER)
        profile, _ = AccountProfile.objects.get_or_create(user=user, defaults={'email_verified': True})
        if not profile.email_verified:
            profile.email_verified = True
            profile.save(update_fields=['email_verified'])
        if requested_team and not WorkspaceMembership.objects.filter(user=user, workspace=requested_team, status=WorkspaceMembership.ACTIVE).exists():
            WorkspaceMembership.objects.get_or_create(
                workspace=requested_team,
                user=user,
                defaults={'role': WorkspaceMembership.MEMBER, 'status': WorkspaceMembership.PENDING},
            )
        if not user.is_active:
            return Response({'detail': 'This account has been disabled.'}, status=status.HTTP_403_FORBIDDEN)
        login(request._request, user)
        return Response(user_session_payload(user))


class PublicTeamListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        teams = Workspace.objects.filter(workspace_type=Workspace.TEAM).order_by('name').values('id', 'name')
        return Response(list(teams))


class WorkspaceListView(APIView):
    def get(self, request):
        memberships = WorkspaceMembership.objects.filter(user=request.user).select_related('workspace').order_by('workspace__name')
        return Response([{
            'id': str(item.workspace_id),
            'name': item.workspace.name,
            'type': item.workspace.workspace_type,
            'role': item.role,
            'status': item.status,
        } for item in memberships])

    def post(self, request):
        name = str(request.data.get('name', '')).strip()
        if not name:
            return Response({'name': ['Enter a team name.']}, status=status.HTTP_400_BAD_REQUEST)
        team = Workspace.objects.create(name=name[:150], workspace_type=Workspace.TEAM, created_by=request.user)
        WorkspaceMembership.objects.create(workspace=team, user=request.user, role=WorkspaceMembership.OWNER)
        return Response({'id': str(team.id), 'name': team.name, 'type': team.workspace_type, 'role': WorkspaceMembership.OWNER, 'status': WorkspaceMembership.ACTIVE}, status=status.HTTP_201_CREATED)


class WorkspaceJoinRequestView(APIView):
    def post(self, request, workspace_id):
        team = Workspace.objects.filter(id=workspace_id, workspace_type=Workspace.TEAM).first()
        if team is None:
            return Response({'detail': 'Team not found.'}, status=status.HTTP_404_NOT_FOUND)
        membership, created = WorkspaceMembership.objects.get_or_create(
            workspace=team,
            user=request.user,
            defaults={'role': WorkspaceMembership.MEMBER, 'status': WorkspaceMembership.PENDING},
        )
        return Response({
            'workspaceId': str(team.id),
            'status': membership.status,
            'detail': 'Access request submitted.' if membership.status == WorkspaceMembership.PENDING else 'You are already a member of this team.',
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class WorkspaceDetailView(APIView):
    def delete(self, request, workspace_id):
        workspace = Workspace.objects.filter(id=workspace_id, workspace_type=Workspace.TEAM).first()
        if workspace is None:
            return Response({'detail': 'Team not found.'}, status=status.HTTP_404_NOT_FOUND)
        is_owner = WorkspaceMembership.objects.filter(
            workspace=workspace,
            user=request.user,
            status=WorkspaceMembership.ACTIVE,
            role=WorkspaceMembership.OWNER,
        ).exists()
        if not is_owner and not request.user.is_staff:
            return Response({'detail': 'Only the team owner or a ProjectNote administrator can delete this team.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            delete_gemini_api_key(workspace_id=workspace.id)
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        workspace.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def get_manageable_team(request, workspace_id):
    workspace = Workspace.objects.filter(id=workspace_id, workspace_type=Workspace.TEAM).first()
    if workspace is None:
        return None
    membership = WorkspaceMembership.objects.filter(
        user=request.user,
        workspace=workspace,
        status=WorkspaceMembership.ACTIVE,
        role__in=[WorkspaceMembership.OWNER, WorkspaceMembership.ADMIN],
    ).first()
    return workspace if membership else None


class WorkspaceUsersView(APIView):
    def get(self, request, workspace_id):
        if get_manageable_team(request, workspace_id) is None:
            return Response({'detail': 'Only team admins can manage members.'}, status=status.HTTP_403_FORBIDDEN)
        memberships = WorkspaceMembership.objects.filter(workspace_id=workspace_id).values_list('user_id', flat=True)
        query = str(request.query_params.get('q', '')).strip()
        user_model = get_user_model()
        users = user_model.objects.filter(is_active=True).exclude(id__in=memberships)
        if query:
            users = users.filter(email__icontains=query)
        return Response([{'id': str(user.id), 'email': user.email, 'name': user.get_full_name() or user.email} for user in users.order_by('email')[:30]])


class WorkspaceMembersView(APIView):
    def get(self, request, workspace_id):
        if get_manageable_team(request, workspace_id) is None:
            return Response({'detail': 'Only team admins can manage members.'}, status=status.HTTP_403_FORBIDDEN)
        memberships = WorkspaceMembership.objects.filter(workspace_id=workspace_id).select_related('user').order_by('created_at')
        return Response([{
            'membershipId': str(item.id),
            'userId': str(item.user_id),
            'email': item.user.email,
            'name': item.user.get_full_name() or item.user.email,
            'role': item.role,
            'status': item.status,
        } for item in memberships])

    def post(self, request, workspace_id):
        workspace = get_manageable_team(request, workspace_id)
        if workspace is None:
            return Response({'detail': 'Only team admins can manage members.'}, status=status.HTTP_403_FORBIDDEN)
        user_id = request.data.get('userId')
        user = get_user_model().objects.filter(id=user_id, is_active=True).first()
        if user is None:
            return Response({'userId': ['Choose an existing account.']}, status=status.HTTP_400_BAD_REQUEST)
        membership, created = WorkspaceMembership.objects.get_or_create(
            workspace=workspace,
            user=user,
            defaults={'role': WorkspaceMembership.MEMBER, 'status': WorkspaceMembership.ACTIVE},
        )
        if not created and membership.status == WorkspaceMembership.PENDING:
            membership.status = WorkspaceMembership.ACTIVE
            membership.save(update_fields=['status'])
        return Response({'membershipId': str(membership.id), 'userId': str(user.id), 'status': membership.status}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, workspace_id):
        workspace = get_manageable_team(request, workspace_id)
        if workspace is None:
            return Response({'detail': 'Only team admins can manage members.'}, status=status.HTTP_403_FORBIDDEN)
        membership = WorkspaceMembership.objects.filter(workspace=workspace, user_id=request.query_params.get('userId')).first()
        if membership is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if membership.role == WorkspaceMembership.OWNER:
            return Response({'detail': 'Transfer team ownership before removing the owner.'}, status=status.HTTP_400_BAD_REQUEST)
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceCardAssignmentsView(APIView):
    CARD_MODELS = {'projects': Project, 'tools': Tool, 'skills': Skill}

    def _get_card_context(self, request, workspace_id, card_type, card_id):
        workspace = get_manageable_team(request, workspace_id)
        if workspace is None:
            return None, None, None
        model = self.CARD_MODELS.get(card_type)
        if model is None:
            return workspace, None, None
        card = model.objects.filter(pk=card_id).filter(Q(workspace=workspace) | Q(shared_with=workspace)).first()
        return workspace, model, card

    def get(self, request, workspace_id, card_type, card_id):
        workspace, model, card = self._get_card_context(request, workspace_id, card_type, card_id)
        if workspace is None:
            return Response({'detail': 'Only team owners/admins can manage assignments.'}, status=status.HTTP_403_FORBIDDEN)
        if model is None:
            return Response({'detail': 'Assignments are supported for projects, tools, and skills.'}, status=status.HTTP_400_BAD_REQUEST)
        if card is None:
            return Response({'detail': 'Card not found in this team workspace.'}, status=status.HTTP_404_NOT_FOUND)
        content_type = ContentType.objects.get_for_model(model)
        assignments = WorkspaceCardAssignment.objects.filter(workspace=workspace, content_type=content_type, object_id=card.pk).select_related('user')
        assigned_ids = {str(item.user_id) for item in assignments}
        return Response({
            'userIds': sorted(assigned_ids),
            'members': [{
                'id': str(member.user_id),
                'email': member.user.email,
                'name': member.user.get_full_name() or member.user.email,
                'assigned': str(member.user_id) in assigned_ids,
            } for member in WorkspaceMembership.objects.filter(workspace=workspace, status=WorkspaceMembership.ACTIVE).select_related('user').order_by('user__email')],
        })

    @transaction.atomic
    def put(self, request, workspace_id, card_type, card_id):
        workspace, model, card = self._get_card_context(request, workspace_id, card_type, card_id)
        if workspace is None:
            return Response({'detail': 'Only team owners/admins can manage assignments.'}, status=status.HTTP_403_FORBIDDEN)
        if model is None:
            return Response({'detail': 'Assignments are supported for projects, tools, and skills.'}, status=status.HTTP_400_BAD_REQUEST)
        if card is None:
            return Response({'detail': 'Card not found in this team workspace.'}, status=status.HTTP_404_NOT_FOUND)
        user_ids = request.data.get('userIds')
        if not isinstance(user_ids, list):
            return Response({'userIds': ['Send a list of active team-member IDs.']}, status=status.HTTP_400_BAD_REQUEST)
        active_ids = set(WorkspaceMembership.objects.filter(workspace=workspace, status=WorkspaceMembership.ACTIVE, user_id__in=user_ids).values_list('user_id', flat=True))
        normalized_ids = {str(user_id) for user_id in active_ids}
        if len(normalized_ids) != len(set(map(str, user_ids))):
            return Response({'userIds': ['Assignments can only be made to active members of this team.']}, status=status.HTTP_400_BAD_REQUEST)
        content_type = ContentType.objects.get_for_model(model)
        WorkspaceCardAssignment.objects.filter(workspace=workspace, content_type=content_type, object_id=card.pk).delete()
        WorkspaceCardAssignment.objects.bulk_create([
            WorkspaceCardAssignment(workspace=workspace, content_type=content_type, object_id=card.pk, user_id=user_id)
            for user_id in active_ids
        ])
        return self.get(request, workspace_id, card_type, card_id)


class ProjectViewSet(WorkspaceScopedViewSet):
    queryset = Project.objects.prefetch_related('nodes__children', 'relationships').all()
    serializer_class = ProjectSerializer

    def perform_create(self, serializer):
        project = serializer.save(workspace=self.get_active_workspace())
        ProjectNode.objects.create(project=project, title=project.title, description=project.description, node_type='project', is_project_root=True, order=0, x=320, y=220)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        project = serializer.instance
        invalidate_project_report_cache(project.id)

    def perform_destroy(self, instance):
        invalidate_project_report_cache(instance.id)
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'], url_path='generate-report')
    def generate_report(self, request, pk=None):
        input_serializer = GenerateProjectReportSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        project = self.get_object()
        project_json = input_serializer.validated_data['project_json']
        if str(project_json['project'].get('id', '')) != str(project.id):
            return Response({'detail': 'The JSON does not belong to this project.'}, status=status.HTTP_400_BAD_REQUEST)
        report_prompt = input_serializer.validated_data['prompt']
        cache_key = f'project-report:{project.id}'
        fingerprint = project_report_fingerprint(project_json, report_prompt)
        cached_report = cache.get(cache_key)
        if cached_report and cached_report['fingerprint'] == fingerprint:
            return Response({'report': cached_report['report'], 'cached': True})
        try:
            gemini_workspace = get_gemini_workspace(request)
            report = generate_project_report(project_json, report_prompt, workspace_id=gemini_workspace.id)
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except GeminiInputTooLargeError as error:
            return Response({'detail': str(error)}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        except GeminiGenerationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_502_BAD_GATEWAY)
        cache.set(cache_key, {'fingerprint': fingerprint, 'report': report}, timeout=None)
        return Response({'report': report, 'cached': False})


class ProjectGroupViewSet(WorkspaceScopedViewSet):
    queryset = ProjectGroup.objects.prefetch_related('items__project', 'relationships').all()
    serializer_class = ProjectGroupSerializer

    def perform_update(self, serializer):
        group = serializer.instance
        previous_shares = set(group.shared_with.values_list('id', flat=True))
        self._associated_project_ids = list(group.items.filter(item_type=ProjectGroupItem.PROJECT, project__isnull=False).values_list('project_id', flat=True))
        super().perform_update(serializer)
        current_shares = set(group.shared_with.values_list('id', flat=True))
        added_shares = current_shares - previous_shares
        removed_shares = previous_shares - current_shares
        projects = Project.objects.filter(id__in=self._associated_project_ids)
        for project in projects:
            if added_shares:
                project.shared_with.add(*added_shares)
            for workspace_id in removed_shares:
                still_in_another_shared_group = ProjectGroupItem.objects.filter(
                    item_type=ProjectGroupItem.PROJECT,
                    project=project,
                    group__shared_with_id=workspace_id,
                ).exclude(group=group).exists()
                if not still_in_another_shared_group:
                    project.shared_with.remove(workspace_id)


class ProjectGroupItemViewSet(WorkspaceScopedViewSet):
    workspace_lookup = 'group__workspace'
    shared_workspace_lookup = 'group__shared_with'
    queryset = ProjectGroupItem.objects.select_related('group', 'project').all()
    serializer_class = ProjectGroupItemSerializer

    def _sync_shared_project(self, item):
        if item.item_type == ProjectGroupItem.PROJECT and item.project_id:
            item.project.shared_with.add(*item.group.shared_with.values_list('id', flat=True))

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._sync_shared_project(serializer.instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._sync_shared_project(serializer.instance)

    def perform_destroy(self, instance):
        project = instance.project if instance.item_type == ProjectGroupItem.PROJECT else None
        inherited_workspaces = list(instance.group.shared_with.values_list('id', flat=True)) if project else []
        group = instance.group
        super().perform_destroy(instance)
        if project:
            for workspace_id in inherited_workspaces:
                still_in_shared_group = ProjectGroupItem.objects.filter(
                    item_type=ProjectGroupItem.PROJECT,
                    project=project,
                    group__shared_with_id=workspace_id,
                ).exists()
                if not still_in_shared_group:
                    project.shared_with.remove(workspace_id)


class ProjectGroupRelationshipViewSet(WorkspaceScopedViewSet):
    workspace_lookup = 'group__workspace'
    shared_workspace_lookup = 'group__shared_with'
    queryset = ProjectGroupRelationship.objects.select_related('group', 'source', 'target').all()
    serializer_class = ProjectGroupRelationshipSerializer


class GeminiSettingsView(APIView):
    def get(self, request):
        try:
            workspace = get_gemini_workspace(request)
            payload = gemini_settings_payload(workspace.id)
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(payload)

    def post(self, request):
        serializer = GeminiSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            workspace = get_gemini_workspace(request, require_admin=True)
            store_gemini_api_key(serializer.validated_data['api_key'], workspace_id=workspace.id)
            WorkspaceGeminiCredential.objects.get_or_create(workspace=workspace)
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(gemini_settings_payload(workspace.id))

    def delete(self, request):
        try:
            workspace = get_gemini_workspace(request, require_admin=True)
            delete_gemini_api_key(workspace_id=workspace.id)
            WorkspaceGeminiCredential.objects.filter(workspace=workspace).delete()
            payload = gemini_settings_payload(workspace.id)
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(payload)


class GeminiKeyTestView(APIView):
    def post(self, request):
        try:
            workspace = get_gemini_workspace(request)
            test_gemini_api_key(workspace_id=workspace.id)
            mark_gemini_api_key_validated(workspace_id=workspace.id)
            payload = gemini_settings_payload(workspace.id)
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except GeminiGenerationError as error:
            clear_gemini_api_key_validation(workspace_id=workspace.id if 'workspace' in locals() else None)
            # Not 502: Cloudflare replaces 502 bodies with its own error page, hiding the message.
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload)


class ColorSchemesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        schemes = cache.get('color-schemes:v4')
        if schemes is None:
            scheme_file = Path(__file__).with_name('color_schemes.json')
            with scheme_file.open(encoding='utf-8') as file:
                schemes = json.load(file)
            cache.set('color-schemes:v4', schemes, timeout=None)
        return Response(schemes)


class ColorSchemeSchemaView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        schema_file = Path(__file__).with_name('color_scheme.schema.json')
        with schema_file.open(encoding='utf-8') as file:
            return Response(json.load(file))


class ColorSchemeTemplateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        template_file = Path(__file__).with_name('color_scheme.template.json')
        with template_file.open(encoding='utf-8') as file:
            return Response(json.load(file))


class ProjectNodeViewSet(WorkspaceScopedViewSet):
    workspace_lookup = 'project__workspace'
    shared_workspace_lookup = 'project__shared_with'
    queryset = ProjectNode.objects.select_related('project', 'parent').all()
    serializer_class = ProjectNodeSerializer

    def perform_create(self, serializer):
        project = serializer.validated_data['project']
        parent = serializer.validated_data.get('parent')
        sibling_order = ProjectNode.objects.filter(project=project, parent=parent).aggregate(max_order=Max('order'))['max_order']
        node = serializer.save(order=(sibling_order + 1 if sibling_order is not None else 0))
        invalidate_project_report_cache(node.project_id)

    def perform_update(self, serializer):
        old_project_id = serializer.instance.project_id
        node = serializer.save()
        invalidate_project_report_cache(old_project_id)
        invalidate_project_report_cache(node.project_id)

    def destroy(self, request, *args, **kwargs):
        node = self.get_object()
        if node.is_project_root:
            return Response({'detail': 'The project root node cannot be deleted.'}, status=400)
        response = super().destroy(request, *args, **kwargs)
        invalidate_project_report_cache(node.project_id)
        return response


class ProjectRelationshipViewSet(WorkspaceScopedViewSet):
    workspace_lookup = 'project__workspace'
    shared_workspace_lookup = 'project__shared_with'
    queryset = ProjectRelationship.objects.select_related('project', 'source', 'target').all()
    serializer_class = ProjectRelationshipSerializer

    def perform_create(self, serializer):
        relationship = serializer.save()
        invalidate_project_report_cache(relationship.project_id)

    def perform_update(self, serializer):
        old_project_id = serializer.instance.project_id
        relationship = serializer.save()
        invalidate_project_report_cache(old_project_id)
        invalidate_project_report_cache(relationship.project_id)

    def perform_destroy(self, instance):
        invalidate_project_report_cache(instance.project_id)
        super().perform_destroy(instance)

class NodeViewSet(WorkspaceScopedViewSet):
    queryset = Node.objects.all()
    
    def get_serializer_class(self):
        # Use nested serializer for individual node lookups (The Report Modal)
        if self.action == 'retrieve':
            return NestedNodeSerializer
        return FlatNodeSerializer

    @action(detail=False, methods=['get'])
    def graph_data(self, request):
        """
        Returns flat arrays optimized for d3-force and Three.js initialization.
        """
        nodes = self.get_queryset().values(
            'id', 'title', 'node_type', 'parent_id', 'x', 'y', 'z'
        )
        edges = Edge.objects.filter(source__workspace=self.get_active_workspace(), target__workspace=self.get_active_workspace()).values(
            'id', 'source_id', 'target_id', 'label'
        )
        
        return Response({
            "nodes": list(nodes),
            "edges": list(edges)
        })

class EdgeViewSet(WorkspaceScopedViewSet):
    workspace_lookup = 'source__workspace'
    shared_workspace_lookup = None
    queryset = Edge.objects.all()
    serializer_class = EdgeSerializer


class SkillViewSet(WorkspaceScopedViewSet):
    queryset = Skill.objects.prefetch_related('tools').all()
    serializer_class = SkillSerializer

    def destroy(self, request, *args, **kwargs):
        skill = self.get_object()
        blocking_tool = skill.tools.annotate(skill_count=Count('skills')).filter(skill_count=1).first()
        if blocking_tool:
            return Response({'detail': f'Cannot delete this skill because {blocking_tool.name} must have at least one skill.'}, status=400)
        return super().destroy(request, *args, **kwargs)


class ToolViewSet(WorkspaceScopedViewSet):
    queryset = Tool.objects.prefetch_related('skills').all()
    serializer_class = ToolSerializer

    def perform_update(self, serializer):
        old_shared_workspaces = set(serializer.instance.shared_with.values_list('id', flat=True))
        old_skill_ids = list(serializer.instance.skills.values_list('id', flat=True))
        super().perform_update(serializer)
        tool = serializer.instance
        current_shared_workspaces = set(tool.shared_with.values_list('id', flat=True))
        added = current_shared_workspaces - old_shared_workspaces
        removed = old_shared_workspaces - current_shared_workspaces
        if added:
            for skill in tool.skills.all():
                skill.shared_with.add(*added)
        if removed:
            for skill in Skill.objects.filter(id__in=set(old_skill_ids) | set(tool.skills.values_list('id', flat=True))):
                for workspace_id in removed:
                    still_needed = Tool.objects.filter(skills=skill, shared_with_id=workspace_id).exclude(id=tool.id).exists()
                    if not still_needed:
                        skill.shared_with.remove(workspace_id)


class EnvironmentViewSet(WorkspaceScopedViewSet):
    queryset = Environment.objects.all()
    serializer_class = EnvironmentSerializer