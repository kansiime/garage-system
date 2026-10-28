"""
Money in and out for one day, by payment method.

In:  money taken at the counter for sales, customer debt payments, and refunds
     from suppliers for returned goods.
Out: money paid at purchase time, supplier debt payments, expenses, and cash
     refunds to customers.
Adjustments (returns credited against a debt) and unpaid expenses move no money.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.choices import PAYMENT_METHODS
from apps.debts.models import DebtPayment
from apps.expenses.models import Expense
from apps.purchases.models import Purchase
from apps.returns.models import Return
from apps.sales.models import Sale

ZERO = Decimal('0')
METHOD_LABELS = dict(PAYMENT_METHODS)


def _day_range(day):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, datetime.min.time()), tz)
    return {'created_at__gte': start, 'created_at__lt': start + timedelta(days=1)}


def day_lines(day):
    """Every money movement on `day` as dicts, oldest first."""
    when = _day_range(day)
    lines = []

    def add(direction, kind, method, amount, reference, party, at):
        if amount and amount > ZERO:
            lines.append({
                'direction': direction, 'kind': kind, 'method': method,
                'amount': amount, 'reference': reference, 'party': party, 'at': at,
            })

    for s in Sale.objects.filter(**when):
        add('in', 'Sale', s.payment_method, s.paid_at_sale, s.reference,
            s.customer_name or 'Walk-in', s.created_at)
    for p in DebtPayment.objects.filter(**when).exclude(method='adjustment').select_related('debt'):
        if p.debt.debt_type == 'receivable':
            add('in', 'Debt payment', p.method, p.amount, p.debt.reference,
                p.debt.party_name, p.created_at)
        else:
            add('out', 'Supplier payment', p.method, p.amount, p.debt.reference,
                p.debt.party_name, p.created_at)
    for p in Purchase.objects.filter(purchase_date=day).select_related('supplier'):
        add('out', 'Purchase', p.payment_method, p.paid_at_purchase, p.reference,
            p.supplier.name if p.supplier else '', p.created_at)
    for r in Return.objects.filter(resolution='refund', **when):
        add('out' if r.return_type == 'sales' else 'in',
            'Refund to customer' if r.return_type == 'sales' else 'Refund from supplier',
            'cash', r.total_amount, r.reference, r.party_name, r.created_at)
    for e in Expense.objects.filter(expense_date=day).exclude(payment_method='credit'):
        add('out', 'Expense', e.payment_method, e.amount, e.reference,
            e.description, e.created_at)

    lines.sort(key=lambda l: l['at'])
    return lines


def day_summary(day):
    lines = day_lines(day)
    methods = []
    for key, label in PAYMENT_METHODS:
        money_in = sum((l['amount'] for l in lines if l['method'] == key and l['direction'] == 'in'), ZERO)
        money_out = sum((l['amount'] for l in lines if l['method'] == key and l['direction'] == 'out'), ZERO)
        methods.append({'method': key, 'label': label,
                        'in': money_in, 'out': money_out, 'net': money_in - money_out})
    cash = methods[0]
    return {
        'date': day,
        'methods': methods,
        'cash_in': cash['in'],
        'cash_out': cash['out'],
        'lines': [
            {key: value for key, value in l.items() if key != 'at'}
            | {'method_label': METHOD_LABELS.get(l['method'], l['method']),
               'time': timezone.localtime(l['at']).strftime('%H:%M')}
            for l in lines
        ],
    }
