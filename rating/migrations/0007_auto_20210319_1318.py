# Generated by Django 3.1.3 on 2021-03-19 13:18

import api.fields.orp
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('rating', '0006_noderatingcomponent'),
    ]

    operations = [
        migrations.AlterField(
            model_name='noderatingcomponent',
            name='example_node',
            field=api.fields.orp.PrintingNodeChildField(),
        ),
        migrations.AlterField(
            model_name='noderatingcomponent',
            name='node',
            field=api.fields.orp.CardboardNodeChildField(),
        ),
    ]
