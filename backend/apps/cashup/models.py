from django.conf import settings
from django.db import models


class CashUp(models.Model):
    """
    End-of-day count of the cash drawer for one date. The expected cash and
    the day's totals are stored as they were when the count was saved, so the
    record stands even if entries for that day change later.
    """
    date = models.DateField(unique=True)
    opening_cash = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cash_in = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cash_out = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    expected_cash = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    counted_cash = models.DecimalField(max_digits=14, decimal_places=2)
    difference = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Float kept in the drawer for tomorrow; the rest was taken or banked
    left_in_drawer = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    summary = models.JSONField(default=dict)
    notes = models.TextField(blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f"Cash-up {self.date}: counted {self.counted_cash}, difference {self.difference}"
