# Generated by Django 3.1.3 on 2021-09-28 11:35

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("kpd", "0005_logpoint_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="logpoint",
            name="timestamp",
            field=models.DateTimeField(),
        ),
        migrations.AlterUniqueTogether(
            name="logpoint",
            unique_together={("timestamp", "type")},
        ),
    ]
