from django.db.models import Q
from rest_framework import serializers
from .models import Environment, Node, Edge, Project, ProjectNode, ProjectRelationship, ProjectGroup, ProjectGroupItem, ProjectGroupRelationship, Skill, Tool, Workspace
from .workspaces import get_active_workspace


def accessible_workspace_filter(workspace, field='workspace'):
    owner_path, _, _ = field.rpartition('__')
    shared_path = f'{owner_path}__shared_with' if owner_path else 'shared_with'
    return Q(**{field: workspace}) | Q(**{shared_path: workspace})


def user_workspace_from_context(context):
    request = context.get('request')
    if request is None or not request.user.is_authenticated:
        return None
    return get_active_workspace(request)

class ProjectNodeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()

    class Meta:
        model = ProjectNode
        fields = ['id', 'project', 'parent', 'title', 'description', 'node_type', 'content', 'image_url', 'list_style', 'is_project_root', 'level', 'order', 'x', 'y', 'children']
        read_only_fields = ['children']

    def get_fields(self):
        fields = super().get_fields()
        workspace = user_workspace_from_context(self.context)
        if workspace is not None:
            projects = Project.objects.filter(accessible_workspace_filter(workspace))
            fields['project'].queryset = projects
            fields['parent'].queryset = ProjectNode.objects.filter(project__in=projects)
        return fields

    def get_children(self, obj):
        return ProjectNodeSerializer(obj.children.all(), many=True).data

    def get_level(self, obj):
        level = 0
        parent = obj.parent
        visited = {obj.id}
        while parent and parent.id not in visited:
            level += 1
            visited.add(parent.id)
            parent = parent.parent
        return level

    def validate_parent(self, value):
        project = self.instance.project if self.instance else self.initial_data.get('project')
        if value and project and str(value.project_id) != str(project):
            raise serializers.ValidationError('A node parent must belong to the same project.')
        return value


class ProjectRelationshipSerializer(serializers.ModelSerializer):
    sourceOrder = serializers.IntegerField(source='source.order', read_only=True)
    targetOrder = serializers.IntegerField(source='target.order', read_only=True)
    sourceLevel = serializers.SerializerMethodField()
    targetLevel = serializers.SerializerMethodField()
    stagnant = serializers.SerializerMethodField()

    class Meta:
        model = ProjectRelationship
        fields = ['id', 'project', 'source', 'target', 'label', 'sourceOrder', 'targetOrder', 'sourceLevel', 'targetLevel', 'stagnant']

    def get_fields(self):
        fields = super().get_fields()
        workspace = user_workspace_from_context(self.context)
        if workspace is not None:
            projects = Project.objects.filter(accessible_workspace_filter(workspace))
            fields['project'].queryset = projects
            fields['source'].queryset = ProjectNode.objects.filter(project__in=projects)
            fields['target'].queryset = ProjectNode.objects.filter(project__in=projects)
        return fields

    def get_sourceLevel(self, obj):
        return ProjectNodeSerializer().get_level(obj.source)

    def get_targetLevel(self, obj):
        return ProjectNodeSerializer().get_level(obj.target)

    def get_stagnant(self, obj):
        return obj.source.order == obj.target.order

    def validate(self, attrs):
        project = attrs.get('project', self.instance.project if self.instance else None)
        source = attrs.get('source', self.instance.source if self.instance else None)
        target = attrs.get('target', self.instance.target if self.instance else None)
        if source and target and (source.project_id != project.id or target.project_id != project.id):
            raise serializers.ValidationError('Both relationship nodes must belong to the project.')
        if source == target:
            raise serializers.ValidationError('A relationship needs two different nodes.')
        if project and source and target:
            relationships = project.relationships.exclude(id=self.instance.id) if self.instance else project.relationships.all()
            outgoing = {}
            for relationship in relationships.values_list('source_id', 'target_id'):
                outgoing.setdefault(relationship[0], set()).add(relationship[1])
            to_visit = [target.id]
            visited = set()
            while to_visit:
                current = to_visit.pop()
                if current == source.id:
                    raise serializers.ValidationError('This connection would create a loop.')
                if current in visited:
                    continue
                visited.add(current)
                to_visit.extend(outgoing.get(current, ()))
        return attrs


class ProjectSerializer(serializers.ModelSerializer):
    nodes = serializers.SerializerMethodField()
    relationships = ProjectRelationshipSerializer(many=True, read_only=True)
    shared_with = serializers.PrimaryKeyRelatedField(many=True, queryset=Workspace.objects.filter(workspace_type=Workspace.TEAM), required=False)

    class Meta:
        model = Project
        fields = ['id', 'workspace', 'shared_with', 'title', 'description', 'nodes', 'relationships', 'created_at', 'updated_at']
        read_only_fields = ['workspace', 'nodes', 'relationships', 'created_at', 'updated_at']

    def get_nodes(self, obj):
        roots = obj.nodes.filter(parent__isnull=True).prefetch_related('children')
        return ProjectNodeSerializer(roots, many=True).data


class ProjectGroupItemSerializer(serializers.ModelSerializer):
    projectTitle = serializers.CharField(source='project.title', read_only=True)
    projectDescription = serializers.CharField(source='project.description', read_only=True)

    class Meta:
        model = ProjectGroupItem
        fields = ['id', 'group', 'project', 'projectTitle', 'projectDescription', 'item_type', 'title', 'content', 'shape_type', 'x', 'y', 'width', 'height', 'order']
        read_only_fields = ['projectTitle', 'projectDescription']

    def get_fields(self):
        fields = super().get_fields()
        workspace = user_workspace_from_context(self.context)
        if workspace is not None:
            groups = ProjectGroup.objects.filter(accessible_workspace_filter(workspace))
            fields['group'].queryset = groups
            fields['project'].queryset = Project.objects.filter(accessible_workspace_filter(workspace))
        return fields

    def validate(self, attrs):
        item_type = attrs.get('item_type', self.instance.item_type if self.instance else None)
        project = attrs.get('project', self.instance.project if self.instance else None)
        shape_type = attrs.get('shape_type', self.instance.shape_type if self.instance else '')
        if item_type == ProjectGroupItem.PROJECT and not project:
            raise serializers.ValidationError({'project': 'Choose a project for a project card.'})
        if item_type != ProjectGroupItem.PROJECT and project:
            raise serializers.ValidationError({'project': 'Only project cards can reference a project.'})
        if item_type == ProjectGroupItem.SHAPE and not shape_type:
            raise serializers.ValidationError({'shape_type': 'Choose a shape type.'})
        if item_type != ProjectGroupItem.SHAPE and shape_type:
            raise serializers.ValidationError({'shape_type': 'Only shape annotations have a shape type.'})
        return attrs


class ProjectGroupSerializer(serializers.ModelSerializer):
    items = ProjectGroupItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source='items.count', read_only=True)
    relationships = serializers.SerializerMethodField()
    shared_with = serializers.PrimaryKeyRelatedField(many=True, queryset=Workspace.objects.filter(workspace_type=Workspace.TEAM), required=False)

    class Meta:
        model = ProjectGroup
        fields = ['id', 'workspace', 'shared_with', 'title', 'description', 'items', 'item_count', 'relationships', 'created_at', 'updated_at']
        read_only_fields = ['workspace', 'items', 'item_count', 'relationships', 'created_at', 'updated_at']

    def get_relationships(self, obj):
        return ProjectGroupRelationshipSerializer(obj.relationships.all(), many=True).data


class ProjectGroupRelationshipSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectGroupRelationship
        fields = ['id', 'group', 'source', 'target', 'relationship_type', 'label']

    def get_fields(self):
        fields = super().get_fields()
        workspace = user_workspace_from_context(self.context)
        if workspace is not None:
            groups = ProjectGroup.objects.filter(accessible_workspace_filter(workspace))
            fields['group'].queryset = groups
            fields['source'].queryset = ProjectGroupItem.objects.filter(group__in=groups)
            fields['target'].queryset = ProjectGroupItem.objects.filter(group__in=groups)
        return fields

    def validate(self, attrs):
        group = attrs.get('group', self.instance.group if self.instance else None)
        source = attrs.get('source', self.instance.source if self.instance else None)
        target = attrs.get('target', self.instance.target if self.instance else None)
        if source and target and source.id == target.id:
            raise serializers.ValidationError('A connection needs two different canvas items.')
        if group and source and target and (source.group_id != group.id or target.group_id != group.id):
            raise serializers.ValidationError('Both connected items must belong to the group.')
        return attrs


class GenerateProjectReportSerializer(serializers.Serializer):
    project_json = serializers.JSONField()
    prompt = serializers.CharField(max_length=4000, required=False, allow_blank=True, default='')

    def validate_project_json(self, value):
        if not isinstance(value, dict) or not isinstance(value.get('project'), dict):
            raise serializers.ValidationError('Project JSON must include a project object.')
        if not isinstance(value.get('nodes'), list) or not isinstance(value.get('relationships'), list):
            raise serializers.ValidationError('Project JSON must include nodes and relationships arrays.')
        return value


class GeminiSettingsSerializer(serializers.Serializer):
    api_key = serializers.CharField(min_length=20, max_length=512, trim_whitespace=True, write_only=True)


class GeminiModelSerializer(serializers.Serializer):
    model = serializers.RegexField(r'^[A-Za-z0-9._-]{0,100}$', allow_blank=True, trim_whitespace=True)

class NodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Node
        fields = '__all__' # This ensures type and content are sent back to React!
        read_only_fields = ['workspace']
class EdgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Edge
        fields = ['id', 'source', 'target', 'label']

        def get_fields(self):
            fields = super().get_fields()
            workspace = user_workspace_from_context(self.context)
            if workspace is not None:
                nodes = Node.objects.filter(workspace=workspace)
                fields['source'].queryset = nodes
                fields['target'].queryset = nodes
            return fields

        def validate(self, attrs):
            source = attrs.get('source', self.instance.source if self.instance else None)
            target = attrs.get('target', self.instance.target if self.instance else None)
            if source and target and source.workspace_id != target.workspace_id:
                raise serializers.ValidationError('Both nodes must belong to the same workspace.')
            return attrs

class NestedNodeSerializer(serializers.ModelSerializer):
    # This creates the infinite nesting recursively
    children = serializers.SerializerMethodField()
    
    class Meta:
        model = Node
        fields = ['id', 'title', 'node_type', 'parent', 'order', 'children']

    def get_children(self, obj):
        # Recursively fetch and serialize children
        if obj.children.exists():
            # In production, use prefetch_related to avoid N+1 query problems
            return NestedNodeSerializer(obj.children.all(), many=True).data
        return []

class FlatNodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Node
        # Update these field names! 
        # 'node_type' becomes 'type', and 'description' becomes 'content'
        fields = ['id', 'type', 'title', 'content', 'imageUrl', 'x', 'y', 'z', 'parent']


class SkillSerializer(serializers.ModelSerializer):
    toolIds = serializers.SerializerMethodField()
    shared_with = serializers.PrimaryKeyRelatedField(many=True, queryset=Workspace.objects.filter(workspace_type=Workspace.TEAM), required=False)

    class Meta:
        model = Skill
        fields = ['id', 'workspace', 'shared_with', 'name', 'description', 'toolIds']
        read_only_fields = ['workspace']

    def get_toolIds(self, obj):
        return list(obj.tools.values_list('id', flat=True))


class ToolSerializer(serializers.ModelSerializer):
    skillIds = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)
    shared_with = serializers.PrimaryKeyRelatedField(many=True, queryset=Workspace.objects.filter(workspace_type=Workspace.TEAM), required=False)

    class Meta:
        model = Tool
        fields = ['id', 'workspace', 'shared_with', 'name', 'description', 'features', 'skillIds']
        read_only_fields = ['workspace']

    def validate_skillIds(self, value):
        if not value:
            raise serializers.ValidationError('A tool must have at least one skill.')
        skills = Skill.objects.filter(id__in=value)
        if skills.count() != len(set(value)):
            raise serializers.ValidationError('One or more selected skills do not exist.')
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get('skillIds'):
            raise serializers.ValidationError({'skillIds': 'A tool must have at least one skill.'})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['skillIds'] = list(instance.skills.values_list('id', flat=True))
        return data

    def create(self, validated_data):
        skill_ids = validated_data.pop('skillIds', [])
        tool = Tool.objects.create(**validated_data)
        tool.skills.set(skill_ids)
        return tool

    def update(self, instance, validated_data):
        skill_ids = validated_data.pop('skillIds', None)
        instance = super().update(instance, validated_data)
        if skill_ids is not None:
            instance.skills.set(skill_ids)
        if not instance.skills.exists():
            raise serializers.ValidationError({'skillIds': 'A tool must have at least one skill.'})
        return instance


class EnvironmentSerializer(serializers.ModelSerializer):
    shared_with = serializers.PrimaryKeyRelatedField(many=True, queryset=Workspace.objects.filter(workspace_type=Workspace.TEAM), required=False)

    class Meta:
        model = Environment
        fields = ['id', 'workspace', 'shared_with', 'name', 'description']
        read_only_fields = ['workspace']

    def validate_skillIds(self, value):
        workspace = user_workspace_from_context(self.context)
        if workspace is not None and Skill.objects.filter(id__in=value).exclude(accessible_workspace_filter(workspace)).exists():
            raise serializers.ValidationError('Select skills available in the active workspace.')
        return value