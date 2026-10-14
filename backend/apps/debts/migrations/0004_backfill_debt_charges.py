"""
Give every existing debt one charge mirroring its amount/amount_paid, linked to
the sale or purchase with the same reference, and bring that sale/purchase's
amount_paid up to date with payments made on the debt since.
"""
from django.db import migrations


def forwards(apps, schema_editor):
    Debt = apps.get_model('debts', 'Debt')
    DebtCharge = apps.get_model('debts', 'DebtCharge')
    Sale = apps.get_model('sales', 'Sale')
    Purchase = apps.get_model('purchases', 'Purchase')

    for debt in Debt.objects.all().iterator():
        if DebtCharge.objects.filter(debt=debt).exists():
            continue
        sale = purchase = None
        if debt.reference:
            if debt.debt_type == 'receivable':
                sale = Sale.objects.filter(reference=debt.reference).first()
            else:
                purchase = Purchase.objects.filter(reference=debt.reference).first()
        charge = DebtCharge.objects.create(
            debt=debt, amount=debt.amount, amount_paid=debt.amount_paid,
            reference=debt.reference, sale=sale, purchase=purchase,
            notes='Migrated from existing debt', user_id=debt.user_id,
        )
        DebtCharge.objects.filter(pk=charge.pk).update(created_at=debt.created_at)

        source = sale or purchase
        if source is not None:
            # Legacy debts carried the full total, so the source's real paid
            # amount is total minus what is still owed on the debt.
            outstanding = max(debt.amount - debt.amount_paid, 0)
            paid = max(source.total_amount - outstanding, 0)
            if paid > source.amount_paid:
                source.amount_paid = min(paid, source.total_amount)
                source.save(update_fields=['amount_paid'])


class Migration(migrations.Migration):

    dependencies = [
        ('debts', '0003_debtcharge'),
        ('sales', '0001_initial'),
        ('purchases', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
