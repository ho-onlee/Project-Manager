from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0019_geminikeycheck'),
    ]

    operations = [
        migrations.AddField(
            model_name='workspace',
            name='gemini_model',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
