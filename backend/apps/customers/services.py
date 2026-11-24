from django.db import transaction

from .models import Customer, name_key, phone_key


def find_existing(name, phone):
    """The customer find_or_create would match, without creating or changing
    anything. None if they'd be new."""
    n, p = name_key(name), phone_key(phone)
    if p:
        return (Customer.objects.filter(phone_key=p).order_by('id').first()
                or (n and Customer.objects.filter(name_key=n, phone_key='').order_by('id').first())
                or None)
    if n:
        return Customer.objects.filter(name_key=n).order_by('id').first()
    return None


def credit_limit_problem(customer, unpaid):
    """None if `unpaid` more credit keeps the customer within their limit,
    else a dict describing by how much it doesn't."""
    from decimal import Decimal
    from .models import amount_owed
    if customer is None or customer.credit_limit is None or unpaid <= 0:
        return None
    owed = amount_owed(customer)
    if owed + unpaid <= customer.credit_limit:
        return None
    return {'owed': owed, 'limit': customer.credit_limit,
            'room': max(customer.credit_limit - owed, Decimal('0')), 'unpaid': unpaid}


def credit_limit_message(customer, problem, *, can_override, what='This sale would leave'):
    return (
        f"{customer.name} already owes {problem['owed']:,.0f} and their credit limit is "
        f"{problem['limit']:,.0f}, so they can take at most {problem['room']:,.0f} more on credit. "
        f"{what} {problem['unpaid']:,.0f} unpaid. "
        + ('Tick "Allow over limit" if it must go through.' if can_override
           else 'Take more payment now, or ask a manager to allow it.')
    )


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
