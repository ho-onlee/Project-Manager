from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_workspacecardassignment'),
    ]

    operations = [
        migrations.AddField(
            model_name='workspacegeminicredential',
            name='encrypted_key',
            field=models.TextField(blank=True, default=''),
        ),
    ]
