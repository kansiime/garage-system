from django.db import transaction

from .models import Customer, name_key, phone_key


def find_or_create(name, phone, *, user=None):
    """
    The customer for this name/phone, created if new. Matching follows the
    debt rules: when there is a phone, the phone decides; otherwise the name.
    Returns None for a walk-in with neither.
    """
    n, p = name_key(name), phone_key(phone)
    if not n and not p:
        return None
    if p:
        customer = Customer.objects.filter(phone_key=p).order_by('id').first()
        if customer is None and n:
            # Same name recorded earlier without a phone: same person
            customer = Customer.objects.filter(name_key=n, phone_key='').order_by('id').first()
            if customer:
                customer.phone = phone
                customer.save()
    else:
        customer = Customer.objects.filter(name_key=n).order_by('id').first()
    if customer is None:
        customer = Customer.objects.create(name=name or phone, phone=phone or '', user=user)
    return customer


@transaction.atomic
def merge(keep, other):
    """Move everything of `other` onto `keep`, combine their open debts, delete `other`."""
    from apps.debts.models import Debt
    from apps.debts.services import merge_debts
    from apps.sales.models import Sale

    Sale.objects.filter(customer=other).update(customer=keep)
    Debt.objects.filter(customer=other).update(
        customer=keep, party_name=keep.name, party_phone=keep.phone)
    open_debts = list(
        Debt.objects.select_for_update().filter(customer=keep, debt_type='receivable')
        .exclude(status='paid').order_by('created_at', 'id')
    )
    for debt in open_debts[1:]:
        merge_debts(open_debts[0], debt)
    if not keep.phone and other.phone:
        keep.phone = other.phone
    if other.notes:
        keep.notes = f'{keep.notes}\n{other.notes}'.strip()
    keep.save()
    other.delete()
    return keep
