# Generated by Django 3.0.6 on 2020-06-02 16:44

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0015_releaseimagebundle'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cubepatch',
            name='versioned_cube',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='patches', to='api.VersionedCube'),
        ),
    ]
