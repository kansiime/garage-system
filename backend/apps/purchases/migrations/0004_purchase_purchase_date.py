from django.db import migrations, models
from django.utils import timezone


def backfill_purchase_dates(apps, schema_editor):
    Purchase = apps.get_model('purchases', 'Purchase')
    for p in Purchase.objects.all().only('id', 'created_at'):
        Purchase.objects.filter(pk=p.pk).update(
            purchase_date=timezone.localtime(p.created_at).date())


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0003_purchaseitem_subtotal'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchase',
            name='purchase_date',
            field=models.DateField(default=timezone.localdate),
        ),
        migrations.RunPython(backfill_purchase_dates, migrations.RunPython.noop),
    ]
