from django.db import models
from django.conf import settings
from django.utils import timezone


class Debt(models.Model):
    """
    A running account for one party (customer or supplier).

    `amount` is the sum of all charges (credit given) and `amount_paid` the sum
    of all payments, so a repeat customer has ONE open debt that grows with each
    credit sale and shrinks with each payment. See apps/debts/services.py.
    """
    DEBT_TYPE = [
        ('receivable', 'Receivable (Owed to us)'),
        ('payable', 'Payable (We owe)'),
    ]
    STATUS = [
        ('open', 'Open'),
        ('partial', 'Partial'),
        ('paid', 'Paid'),
    ]
    debt_type = models.CharField(max_length=20, choices=DEBT_TYPE)
    party_name = models.CharField(max_length=200)
    party_phone = models.CharField(max_length=50, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS, default='open')
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    promised_date = models.DateField(null=True, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def balance(self):
        return self.amount - self.amount_paid

    @property
    def promise_status(self):
        """Returns 'overdue', 'due_today', 'upcoming', or None."""
        if not self.promised_date or self.status == 'paid':
            return None
        today = timezone.localtime().date()
        if self.promised_date < today:
            return 'overdue'
        if self.promised_date == today:
            return 'due_today'
        return 'upcoming'

    def update_status(self):
        if self.amount_paid >= self.amount:
            self.status = 'paid'
        elif self.amount_paid > 0:
            self.status = 'partial'
        else:
            self.status = 'open'
        self.save()

    def __str__(self):
        return f"{self.get_debt_type_display()} — {self.party_name}: {self.balance}"


class DebtCharge(models.Model):
    """
    One line of credit added to a debt (a credit sale's unpaid balance, a
    purchase's unpaid balance, a manual entry, or an adjustment).
    Payments are allocated to charges oldest-first via `amount_paid`.
    """
    debt = models.ForeignKey(Debt, on_delete=models.CASCADE, related_name='charges')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reference = models.CharField(max_length=100, blank=True)
    sale = models.ForeignKey(
        'sales.Sale', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='debt_charges',
    )
    purchase = models.ForeignKey(
        'purchases.Purchase', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='debt_charges',
    )
    notes = models.TextField(blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    @property
    def balance(self):
        return self.amount - self.amount_paid

    def __str__(self):
        return f"Charge {self.amount} on {self.debt.party_name} ({self.reference})"


class DebtPayment(models.Model):
    debt = models.ForeignKey(
        Debt, on_delete=models.CASCADE, related_name='payments'
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    notes = models.TextField(blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Payment {self.amount} for {self.debt.party_name}"
