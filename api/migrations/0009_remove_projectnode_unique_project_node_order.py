from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0008_alter_projectnode_image_url'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='projectnode',
            name='unique_project_node_order',
        ),
    ]