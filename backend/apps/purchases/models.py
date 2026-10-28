from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.accounts.choices import PAYMENT_METHODS
from apps.inventory.models import Product, Supplier


class Purchase(models.Model):
    STATUS = [
        ('pending', 'Pending'),
        ('received', 'Received'),
        ('cancelled', 'Cancelled'),
    ]
    reference = models.CharField(max_length=50, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True)
    status = models.CharField(max_length=20, choices=STATUS, default='pending')
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Paid to the supplier when the purchase was recorded, and how
    paid_at_purchase = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS, default='cash')
    notes = models.TextField(blank=True)
    # Day the goods came in; can be earlier than created_at when entered late
    purchase_date = models.DateField(default=timezone.localdate)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def balance(self):
        return self.total_amount - self.amount_paid


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    # Stored rather than quantity * unit_cost: supplier invoices give line
    # totals (6 for 113,000) whose unit cost doesn't fit in 2 decimals
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)