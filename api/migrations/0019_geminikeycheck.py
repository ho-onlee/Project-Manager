from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_workspacegeminicredential_encrypted_key'),
    ]

    operations = [
        migrations.CreateModel(
            name='GeminiKeyCheck',
            fields=[
                ('fingerprint', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('checked_at', models.DateTimeField()),
            ],
        ),
    ]
