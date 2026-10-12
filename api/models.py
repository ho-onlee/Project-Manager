
from django.db import models
import uuid

class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title


class ProjectNode(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='nodes')
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True, related_name='children'
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    node_type = models.CharField(max_length=32, default='step')
    content = models.TextField(blank=True, default='')
    image_url = models.TextField(blank=True, default='')
    list_style = models.CharField(max_length=3, blank=True, default='')
    is_project_root = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    x = models.FloatField(default=120.0)
    y = models.FloatField(default=120.0)

    class Meta:
        ordering = ['order', 'title']
        constraints = [
            models.UniqueConstraint(fields=['project'], condition=models.Q(is_project_root=True), name='unique_project_root_node'),
        ]

    def __str__(self):
        return self.title


class ProjectRelationship(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='relationships')
    source = models.ForeignKey(ProjectNode, on_delete=models.CASCADE, related_name='outgoing_relationships')
    target = models.ForeignKey(ProjectNode, on_delete=models.CASCADE, related_name='incoming_relationships')
    label = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['project', 'source', 'target'], name='unique_project_relationship'),
        ]

    def __str__(self):
        return f'{self.source.title} -> {self.target.title}'


class ProjectGroup(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title


class ProjectGroupItem(models.Model):
    PROJECT = 'project'
    TEXT = 'text'
    SHAPE = 'shape'
    ITEM_TYPES = [(PROJECT, 'Project'), (TEXT, 'Text annotation'), (SHAPE, 'Shape annotation')]
    SHAPE_TYPES = [
        ('rectangle', 'Rectangle'),
        ('circle', 'Circle'),
        ('diamond', 'Diamond'),
        ('arrow', 'Arrow'),
        ('line', 'Line'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(ProjectGroup, on_delete=models.CASCADE, related_name='items')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name='group_items')
    item_type = models.CharField(max_length=16, choices=ITEM_TYPES)
    title = models.CharField(max_length=255, blank=True, default='')
    content = models.TextField(blank=True, default='')
    shape_type = models.CharField(max_length=16, choices=SHAPE_TYPES, blank=True, default='')
    x = models.FloatField(default=40)
    y = models.FloatField(default=40)
    width = models.FloatField(default=220)
    height = models.FloatField(default=132)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['group', 'project'], condition=models.Q(item_type='project'), name='unique_project_in_group'),
        ]

    def __str__(self):
        return self.title or (self.project.title if self.project else self.item_type)


class ProjectGroupRelationship(models.Model):
    DIRECTIONAL = 'directional'
    LOOSE = 'loose'
    DEPENDENCY = 'dependency'
    BIDIRECTIONAL = 'bidirectional'
    RELATIONSHIP_TYPES = [
        (DIRECTIONAL, 'Directional relationship'),
        (LOOSE, 'Loose connection'),
        (DEPENDENCY, 'Dependency'),
        (BIDIRECTIONAL, 'Bidirectional relationship'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(ProjectGroup, on_delete=models.CASCADE, related_name='relationships')
    source = models.ForeignKey(ProjectGroupItem, on_delete=models.CASCADE, related_name='outgoing_group_relationships')
    target = models.ForeignKey(ProjectGroupItem, on_delete=models.CASCADE, related_name='incoming_group_relationships')
    relationship_type = models.CharField(max_length=16, choices=RELATIONSHIP_TYPES, default=DIRECTIONAL)
    label = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['group', 'source', 'target'], name='unique_project_group_connection')]

    def __str__(self):
        return f'{self.source} -> {self.target}'


class Node(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # --- Make sure these three fields exist! ---
    type = models.CharField(max_length=10, default='NOT') 
    content = models.TextField(blank=True, null=True) 
    imageUrl = models.URLField(max_length=500, blank=True, null=True)
    
    title = models.CharField(max_length=255, blank=True, null=True)
    x = models.FloatField(default=0.0)
    y = models.FloatField(default=0.0)
    z = models.FloatField(default=0.0)
    parent = models.UUIDField(blank=True, null=True)

    def __str__(self):
        return self.title or str(self.id)

class Edge(models.Model):
    """For cross-connections that don't fit strict parent/child hierarchies."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='outgoing_edges')
    target = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='incoming_edges')
    label = models.CharField(max_length=50, blank=True, null=True) # e.g., 'blocks', 'references'

    def __str__(self):
        return f"{self.source.title} -> {self.target.title}"


class Skill(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')

    def __str__(self):
        return self.name


class Tool(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    features = models.JSONField(default=list, blank=True)
    skills = models.ManyToManyField(Skill, related_name='tools')

    def __str__(self):
        return self.name


class Environment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')

    def __str__(self):
        return self.name