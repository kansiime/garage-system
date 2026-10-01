from django.db import models
from django.conf import settings
from apps.inventory.models import Product


class Return(models.Model):
    RETURN_TYPES = [
        ('sales', 'Sales Return (from customer)'),
        ('purchase', 'Purchase Return (to supplier)'),
    ]
    RESOLUTION = [
        ('refund', 'Cash Refund'),
        ('credit', 'Store Credit / Debt Adjustment'),
        ('exchange', 'Exchange (no cash)'),
        ('pending', 'Pending Resolution'),
    ]

    reference = models.CharField(max_length=50, unique=True)
    return_type = models.CharField(max_length=20, choices=RETURN_TYPES)
    resolution = models.CharField(max_length=20, choices=RESOLUTION, default='pending')

    party_name = models.CharField(max_length=200, blank=True)
    party_phone = models.CharField(max_length=20, blank=True)

    # Link to the original sale or purchase (optional, by reference)
    original_reference = models.CharField(max_length=50, blank=True)
    original_sale = models.ForeignKey(
        'sales.Sale', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='returns',
    )
    original_purchase = models.ForeignKey(
        'purchases.Purchase', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='returns',
    )

    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_return_type_display()} {self.reference}"


class ReturnItem(models.Model):
    return_record = models.ForeignKey(Return, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    @property
    def subtotal(self):
        return self.quantity * self.unit_price