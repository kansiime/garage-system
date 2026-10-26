import re

from django.db import migrations


def name_key(name):
    return ' '.join((name or '').split()).lower()


def phone_key(phone):
    digits = re.sub(r'\D', '', phone or '')
    return digits[-9:] if len(digits) >= 9 else digits


def backfill(apps, schema_editor):
    """Create a customer for every named party on sales and receivable debts and link them."""
    Customer = apps.get_model('customers', 'Customer')
    Sale = apps.get_model('sales', 'Sale')
    Debt = apps.get_model('debts', 'Debt')

    def find_or_create(name, phone, created_at):
        name = ' '.join((name or '').split())
        phone = (phone or '').strip()
        n, p = name_key(name), phone_key(phone)
        # Old auto-labels for unnamed credit, e.g. "Customer (SL-…)"
        if not (n or p) or name.startswith(('Customer (SL-', 'Customer (PO-')):
            return None
        if p:
            customer = Customer.objects.filter(phone_key=p).order_by('id').first()
            if customer is None and n:
                customer = Customer.objects.filter(name_key=n, phone_key='').order_by('id').first()
                if customer:
                    customer.phone, customer.phone_key = phone, p
                    customer.save(update_fields=['phone', 'phone_key'])
        else:
            customer = Customer.objects.filter(name_key=n).order_by('id').first()
        if customer is None:
            customer = Customer.objects.create(
                name=name or phone, phone=phone, name_key=n or name_key(phone), phone_key=p)
            Customer.objects.filter(pk=customer.pk).update(created_at=created_at)
        return customer

    for sale in Sale.objects.order_by('created_at', 'id'):
        sale.customer = find_or_create(sale.customer_name, sale.customer_phone, sale.created_at)
        if sale.customer:
            sale.save(update_fields=['customer'])
    for debt in Debt.objects.filter(debt_type='receivable').order_by('created_at', 'id'):
        debt.customer = find_or_create(debt.party_name, debt.party_phone, debt.created_at)
        if debt.customer:
            debt.save(update_fields=['customer'])


def unlink(apps, schema_editor):
    apps.get_model('sales', 'Sale').objects.update(customer=None)
    apps.get_model('debts', 'Debt').objects.update(customer=None)
    apps.get_model('customers', 'Customer').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0001_initial'),
        ('sales', '0003_sale_customer'),
        ('debts', '0009_debt_customer'),
    ]

    operations = [
        migrations.RunPython(backfill, unlink),
    ]
