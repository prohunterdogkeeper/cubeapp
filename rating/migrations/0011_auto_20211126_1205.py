# Generated by Django 3.1.3 on 2021-11-26 11:05

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0023_eeerror'),
        ('rating', '0010_auto_20211115_1417'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ratingmap',
            name='release',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='all_rating_maps', to='api.cuberelease'),
        ),
    ]
