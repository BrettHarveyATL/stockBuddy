# Generated by Django 2.2.4 on 2021-03-04 21:37

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stock_buddy_app', '0004_auto_20210304_1636'),
    ]

    operations = [
        migrations.AddField(
            model_name='position',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default='old'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='position',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name='position',
            name='bought_at',
            field=models.FloatField(),
        ),
    ]