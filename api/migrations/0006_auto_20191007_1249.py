# Generated by Django 2.2.5 on 2019-10-07 12:49

from django.db import migrations

import api.fields.orp


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0005_auto_20191007_1247"),
    ]

    operations = [
        migrations.AlterField(
            model_name="cubepatch",
            name="patch",
            field=api.fields.orp.OrpField(model_type="magiccube.update.cubeupdate.CubePatch"),
        ),
    ]
