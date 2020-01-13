# Generated by Django 3.0.1 on 2020-01-13 14:41

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('wishlist', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='cardboardwish',
            name='updated_by',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, related_name='modified_cardboard_wishes', to=settings.AUTH_USER_MODEL),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='requirement',
            name='updated_by',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.DO_NOTHING, related_name='modified_requirements', to=settings.AUTH_USER_MODEL),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='wish',
            name='comment',
            field=models.CharField(default='', max_length=255),
        ),
        migrations.AddField(
            model_name='wish',
            name='updated_by',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, related_name='modified_wishes', to=settings.AUTH_USER_MODEL),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='wishlist',
            name='owner',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, related_name='wishlists', to=settings.AUTH_USER_MODEL),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='requirement',
            name='cardboard_wish',
            field=models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, related_name='requirements', to='wishlist.CardboardWish'),
        ),
        migrations.AlterField(
            model_name='wishlist',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True),
        ),

        migrations.RunSQL(
            """
            alter table cubespoiler.wishlist_requirement
            add constraint updated_by_id
            foreign key (updated_by_id)
            REFERENCES cubespoiler.auth_user(id)
            on delete cascade;
            """
        )
    ]
