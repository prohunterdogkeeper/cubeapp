# Generated by Django 3.1.3 on 2021-05-03 13:46

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("rating", "0007_auto_20210319_1318"),
    ]

    operations = [
        migrations.AddField(
            model_name="noderatingcomponent",
            name="weight",
            field=models.DecimalField(decimal_places=2, default=1, max_digits=8),
            preserve_default=False,
        ),
    ]
