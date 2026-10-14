"""
All money movement on debts goes through here so the rules live in one place:

* One running debt per party: new credit for a party that already has an
  unpaid debt of the same type is added to it (matched by phone, else by name).
* Payments must be > 0 and <= the outstanding balance.
* Payments are allocated to the oldest charges first, and charges that came
  from a sale/purchase push the payment back onto that sale/purchase so its
  own balance stays live.

Invariant: debt.amount == sum(charges.amount) and
           debt.amount_paid == sum(charges.amount_paid).
"""
import re
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import Debt, DebtCharge, DebtPayment

ZERO = Decimal('0')


def normalize_name(name):
    return ' '.join((name or '').split()).lower()


def normalize_phone(phone):
    digits = re.sub(r'\D', '', phone or '')
    # Compare on the local part so 0772123456 == +256772123456
    return digits[-9:] if len(digits) >= 9 else digits


def _same_party(debt, name, phone):
    n_new, p_new = normalize_name(name), normalize_phone(phone)
    n_old, p_old = normalize_name(debt.party_name), normalize_phone(debt.party_phone)
    if p_new and p_old:
        return p_new == p_old           # both have phones → phone decides
    return bool(n_new) and n_new == n_old


def find_open_debt(debt_type, name, phone):
    """Oldest unpaid debt of this type for the same party, locked for update."""
    candidates = (
        Debt.objects.select_for_update()
        .filter(debt_type=debt_type)
        .exclude(status='paid')
        .order_by('created_at', 'id')
    )
    for debt in candidates:
        if _same_party(debt, name, phone):
            return debt
    return None


@transaction.atomic
def add_charge(*, debt_type, party_name, party_phone='', amount, reference='',
               sale=None, purchase=None, notes='', user=None, promised_date=None):
    """
    Add credit for a party. Returns (debt, merged) where merged=True means the
    amount was added to an existing open debt rather than a new one.
    """
    amount = Decimal(amount)
    if amount <= ZERO:
        raise ValidationError({'amount': 'Amount must be greater than 0.'})
    party_name = ' '.join((party_name or '').split())
    party_phone = (party_phone or '').strip()
    if not party_name:
        raise ValidationError({'party_name': 'A name is required to give credit.'})

    debt = find_open_debt(debt_type, party_name, party_phone)
    merged = debt is not None
    if debt is None:
        debt = Debt.objects.create(
            debt_type=debt_type, party_name=party_name, party_phone=party_phone,
            amount=ZERO, reference=reference, notes=notes, user=user,
            promised_date=promised_date,
        )
    else:
        if party_phone and not debt.party_phone:
            debt.party_phone = party_phone
        if promised_date:
            debt.promised_date = promised_date

    DebtCharge.objects.create(
        debt=debt, amount=amount, reference=reference, sale=sale,
        purchase=purchase, notes=notes, user=user,
    )
    debt.amount += amount
    debt.update_status()
    return debt, merged


def _allocate(debt, amount, prefer_charge_id=None):
    """Spread `amount` over the debt's charges oldest-first (preferred one first)."""
    remaining = amount
    charges = list(debt.charges.select_for_update().order_by('created_at', 'id'))
    charges.sort(key=lambda c: c.id != prefer_charge_id)
    for charge in charges:
        if remaining <= ZERO:
            break
        open_amt = charge.amount - charge.amount_paid
        if open_amt <= ZERO:
            continue
        take = min(open_amt, remaining)
        charge.amount_paid += take
        charge.save(update_fields=['amount_paid'])
        source = charge.sale or charge.purchase
        if source is not None:
            source.amount_paid = min(source.total_amount, source.amount_paid + take)
            source.save(update_fields=['amount_paid'])
        remaining -= take


@transaction.atomic
def record_payment(debt_id, amount, *, user=None, notes='', prefer_charge_id=None):
    """Record a payment against a debt and deduct it from the balance."""
    debt = Debt.objects.select_for_update().get(pk=debt_id)
    amount = Decimal(amount)
    if amount <= ZERO:
        raise ValidationError({'amount': 'Payment must be greater than 0.'})
    if debt.status == 'paid' or debt.balance <= ZERO:
        raise ValidationError({'amount': 'This debt is already fully paid.'})
    if amount > debt.balance:
        raise ValidationError(
            {'amount': f'Payment {amount:,.2f} is more than the balance {debt.balance:,.2f}.'}
        )
    payment = DebtPayment.objects.create(debt=debt, amount=amount, notes=notes, user=user)
    _allocate(debt, amount, prefer_charge_id)
    debt.amount_paid += amount
    debt.update_status()
    return debt, payment


@transaction.atomic
def adjust_amount(debt, new_amount, *, user=None, notes=''):
    """Change a debt's total via an audited adjustment charge."""
    debt = Debt.objects.select_for_update().get(pk=debt.pk)
    new_amount = Decimal(new_amount)
    if new_amount <= ZERO:
        raise ValidationError({'amount': 'Amount must be greater than 0.'})
    if new_amount < debt.amount_paid:
        raise ValidationError(
            {'amount': f'Amount cannot be less than what has already been paid ({debt.amount_paid:,.2f}).'}
        )
    delta = new_amount - debt.amount
    if delta:
        DebtCharge.objects.create(
            debt=debt, amount=delta, reference='ADJUSTMENT',
            notes=notes or f'Amount changed from {debt.amount} to {new_amount}', user=user,
        )
        debt.amount = new_amount
        debt.update_status()
    return debt


@transaction.atomic
def credit_by_reference(debt_type, reference, amount, *, user=None, notes=''):
    """
    Reduce the debt that holds the charge for `reference` (used by returns),
    applied to that charge first.
    Recorded as a payment so it shows in history. Returns the amount applied.
    """
    charge = (
        DebtCharge.objects.select_related('debt')
        .filter(debt__debt_type=debt_type, reference=reference)
        .exclude(debt__status='paid')
        .first()
    )
    if not charge:
        return ZERO
    # Only the unpaid part of that sale/purchase can be credited; anything
    # beyond it is a cash refund, not a debt reduction.
    applied = min(Decimal(amount), charge.balance, charge.debt.balance)
    if applied > ZERO:
        record_payment(charge.debt_id, applied, user=user, notes=notes,
                       prefer_charge_id=charge.id)
    return applied
