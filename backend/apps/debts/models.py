from django.db import models
from django.conf import settings


class Debt(models.Model):
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
    party_phone = models.CharField(max_length=20, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS, default='open')
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def balance(self):
        return self.amount - self.amount_paid

    def update_status(self):
        if self.amount_paid >= self.amount:
            self.status = 'paid'
        elif self.amount_paid > 0:
            self.status = 'partial'
        else:
            self.status = 'open'
        self.save()


class DebtPayment(models.Model):
    debt = models.ForeignKey(Debt, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    notes = models.TextField(blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)