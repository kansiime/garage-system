from django.db import models
from django.conf import settings
from apps.accounts.choices import PAYMENT_METHODS
from apps.inventory.models import Product


class Sale(models.Model):
    PAYMENT = [
        ('cash', 'Cash'),
        ('credit', 'Credit'),
        ('partial', 'Partial'),
    ]
    reference = models.CharField(max_length=50, unique=True)
    customer_name = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=20, blank=True)
    # customer_name/customer_phone keep what was on the sale at the time
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.PROTECT, null=True, blank=True,
        related_name='sales',
    )
    payment_type = models.CharField(max_length=20, choices=PAYMENT, default='cash')
    # Money taken at the counter when the sale was made, and how it was paid.
    # amount_paid also grows with later debt payments; paid_at_sale does not.
    paid_at_sale = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS, default='cash')
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def balance(self):
        return self.total_amount - self.amount_paid


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    @property
    def subtotal(self):
        return self.quantity * self.unit_price

    @property
    def profit(self):
        return self.quantity * (self.unit_price - self.cost_price)