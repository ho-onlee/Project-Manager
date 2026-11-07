import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_workspace_gemini_model'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectResearchPlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('summary', models.TextField(blank=True, default='')),
                ('plan_json', models.JSONField()),
                ('source_project_json', models.JSONField(blank=True, default=dict)),
                ('prompt', models.TextField(blank=True, default='')),
                ('clarifications', models.JSONField(blank=True, default=list)),
                ('generation_fingerprint', models.CharField(max_length=64)),
                ('plan_fingerprint', models.CharField(db_index=True, max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('applied_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generated_research_plans', to=settings.AUTH_USER_MODEL)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='research_plans', to='api.project')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='projectresearchplan',
            constraint=models.UniqueConstraint(fields=('project', 'generation_fingerprint'), name='unique_project_research_plan_generation'),
        ),
    ]