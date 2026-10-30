from .models import ProjectNode

DEFAULT_TEXT_NODES = (
    {'title': 'Goal', 'description': '', 'x': 20, 'y': 80},
    {'title': 'Participants', 'description': '', 'x': 20, 'y': 220},
    {'title': 'Location', 'description': '', 'x': 20, 'y': 360},
)


def create_default_text_nodes(project):
    return [
        ProjectNode.objects.create(project=project, node_type='text', order=index + 1, **spec)
        for index, spec in enumerate(DEFAULT_TEXT_NODES)
    ]
