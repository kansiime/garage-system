from django.db import migrations, models
from django.db.models import F


def backfill_subtotals(apps, schema_editor):
    PurchaseItem = apps.get_model('purchases', 'PurchaseItem')
    PurchaseItem.objects.update(subtotal=F('quantity') * F('unit_cost'))


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0002_purchase_paid_at_purchase_purchase_payment_method'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseitem',
            name='subtotal',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
            preserve_default=False,
        ),
        migrations.RunPython(backfill_subtotals, migrations.RunPython.noop),
    ]
