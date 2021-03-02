# Generated by Django 3.1.3 on 2021-02-26 11:11

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('contenttypes', '0002_remove_content_type_name'),
        ('rating', '0002_auto_20201001_1026'),
    ]

    operations = [
        migrations.AddField(
            model_name='ratingmap',
            name='ratings_for_content_type',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, to='contenttypes.contenttype'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='ratingmap',
            name='ratings_for_object_id',
            field=models.PositiveIntegerField(default=1),
            preserve_default=False,
        ),
        migrations.AlterUniqueTogether(
            name='cardboardcubeablerating',
            unique_together={('cardboard_cubeable_id', 'rating_map')},
        ),
        migrations.AlterUniqueTogether(
            name='ratingmap',
            unique_together={('ratings_for_content_type', 'ratings_for_object_id')},
        ),
    ]
