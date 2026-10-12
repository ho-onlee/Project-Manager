import json
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from rest_framework import status, viewsets
from django.db.models import Count, Max
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Environment, Node, Edge, Project, ProjectNode, ProjectRelationship, ProjectGroup, ProjectGroupItem, ProjectGroupRelationship, Skill, Tool
from .gemini import GeminiConfigurationError, GeminiGenerationError, GeminiInputTooLargeError, clear_gemini_api_key_validation, delete_gemini_api_key, generate_project_report, get_gemini_api_key, get_gemini_key_source, is_gemini_api_key_validated, mark_gemini_api_key_validated, project_report_fingerprint, store_gemini_api_key, test_gemini_api_key
from .serializers import EnvironmentSerializer, FlatNodeSerializer, GeminiSettingsSerializer, GenerateProjectReportSerializer, NestedNodeSerializer, EdgeSerializer, ProjectGroupItemSerializer, ProjectGroupRelationshipSerializer, ProjectGroupSerializer, ProjectNodeSerializer, ProjectRelationshipSerializer, ProjectSerializer, SkillSerializer, ToolSerializer


def invalidate_project_report_cache(project_id):
    cache.delete(f'project-report:{project_id}')


def gemini_settings_payload(source=None):
    source = source if source is not None else get_gemini_key_source()
    return {
        'configured': source is not None,
        'validated': is_gemini_api_key_validated(),
        'model': settings.GEMINI_MODEL,
        'source': source,
    }


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.prefetch_related('nodes__children', 'relationships').all()
    serializer_class = ProjectSerializer

    def perform_create(self, serializer):
        project = serializer.save()
        ProjectNode.objects.create(project=project, title=project.title, description=project.description, node_type='project', is_project_root=True, order=0, x=320, y=220)

    def perform_update(self, serializer):
        project = serializer.save()
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
            report = generate_project_report(project_json, report_prompt)
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except GeminiInputTooLargeError as error:
            return Response({'detail': str(error)}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        except GeminiGenerationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_502_BAD_GATEWAY)
        cache.set(cache_key, {'fingerprint': fingerprint, 'report': report}, timeout=None)
        return Response({'report': report, 'cached': False})


class ProjectGroupViewSet(viewsets.ModelViewSet):
    queryset = ProjectGroup.objects.prefetch_related('items__project', 'relationships').all()
    serializer_class = ProjectGroupSerializer


class ProjectGroupItemViewSet(viewsets.ModelViewSet):
    queryset = ProjectGroupItem.objects.select_related('group', 'project').all()
    serializer_class = ProjectGroupItemSerializer


class ProjectGroupRelationshipViewSet(viewsets.ModelViewSet):
    queryset = ProjectGroupRelationship.objects.select_related('group', 'source', 'target').all()
    serializer_class = ProjectGroupRelationshipSerializer


class GeminiSettingsView(APIView):
    def get(self, request):
        try:
            payload = gemini_settings_payload()
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(payload)

    def post(self, request):
        serializer = GeminiSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            store_gemini_api_key(serializer.validated_data['api_key'])
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'configured': True, 'validated': is_gemini_api_key_validated(), 'model': settings.GEMINI_MODEL, 'source': 'Windows Credential Manager'})

    def delete(self, request):
        try:
            delete_gemini_api_key()
            payload = gemini_settings_payload()
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(payload)


class GeminiKeyTestView(APIView):
    def post(self, request):
        try:
            test_gemini_api_key()
            mark_gemini_api_key_validated()
            payload = gemini_settings_payload()
        except GeminiConfigurationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except GeminiGenerationError as error:
            clear_gemini_api_key_validation()
            return Response({'detail': str(error)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(payload)


class ColorSchemesView(APIView):
    def get(self, request):
        schemes = cache.get('color-schemes:v4')
        if schemes is None:
            scheme_file = Path(__file__).with_name('color_schemes.json')
            with scheme_file.open(encoding='utf-8') as file:
                schemes = json.load(file)
            cache.set('color-schemes:v4', schemes, timeout=None)
        return Response(schemes)


class ColorSchemeSchemaView(APIView):
    def get(self, request):
        schema_file = Path(__file__).with_name('color_scheme.schema.json')
        with schema_file.open(encoding='utf-8') as file:
            return Response(json.load(file))


class ColorSchemeTemplateView(APIView):
    def get(self, request):
        template_file = Path(__file__).with_name('color_scheme.template.json')
        with template_file.open(encoding='utf-8') as file:
            return Response(json.load(file))


class ProjectNodeViewSet(viewsets.ModelViewSet):
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


class ProjectRelationshipViewSet(viewsets.ModelViewSet):
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

class NodeViewSet(viewsets.ModelViewSet):
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
        edges = Edge.objects.all().values(
            'id', 'source_id', 'target_id', 'label'
        )
        
        return Response({
            "nodes": list(nodes),
            "edges": list(edges)
        })

class EdgeViewSet(viewsets.ModelViewSet):
    queryset = Edge.objects.all()
    serializer_class = EdgeSerializer


class SkillViewSet(viewsets.ModelViewSet):
    queryset = Skill.objects.prefetch_related('tools').all()
    serializer_class = SkillSerializer

    def destroy(self, request, *args, **kwargs):
        skill = self.get_object()
        blocking_tool = skill.tools.annotate(skill_count=Count('skills')).filter(skill_count=1).first()
        if blocking_tool:
            return Response({'detail': f'Cannot delete this skill because {blocking_tool.name} must have at least one skill.'}, status=400)
        return super().destroy(request, *args, **kwargs)


class ToolViewSet(viewsets.ModelViewSet):
    queryset = Tool.objects.prefetch_related('skills').all()
    serializer_class = ToolSerializer


class EnvironmentViewSet(viewsets.ModelViewSet):
    queryset = Environment.objects.all()
    serializer_class = EnvironmentSerializer