# Generated by Django 3.1.3 on 2021-09-13 13:34

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("draft", "0009_auto_20210601_0913"),
    ]

    operations = [
        migrations.AddField(
            model_name="draftpick",
            name="booster_id",
            field=models.CharField(default="", max_length=36),
            preserve_default=False,
        ),
    ]
