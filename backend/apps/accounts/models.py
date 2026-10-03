from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('cashier', 'Cashier'),
        ('storekeeper', 'Storekeeper'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='cashier')
    phone = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return f"{self.username} ({self.role})"

class GarageSettings(models.Model):
    """Single-row settings for the garage. Always use .load() to access."""
    name = models.CharField(max_length=200, default='My Garage')
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    tin = models.CharField(max_length=50, blank=True, verbose_name='TIN')
    currency_code = models.CharField(max_length=10, default='UGX')
    currency_symbol = models.CharField(max_length=10, default='UGX')
    receipt_footer = models.TextField(blank=True, default='Thank you for your business!')
    logo = models.ImageField(upload_to='logos/', blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Garage Settings'
        verbose_name_plural = 'Garage Settings'

    def __str__(self):
        return self.name

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

class AuditLog(models.Model):
    ACTIONS = [
        ('login', 'Login'),
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('stock_in', 'Stock In'),
        ('stock_out', 'Stock Out'),
        ('stock_adjust', 'Stock Adjustment'),
        ('reconcile', 'Reconciliation'),
        ('payment', 'Payment'),
        ('expense', 'Expense'),
    ]
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=30, choices=ACTIONS)
    model_name = models.CharField(max_length=60, blank=True)
    object_id = models.CharField(max_length=60, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user} {self.action} {self.model_name}#{self.object_id}"


# after receipt_footer
whatsapp_template_debt = models.TextField(
    blank=True,
    default=(
        'Hello {name}, this is a friendly reminder about your outstanding '
        'balance of {amount} at {business}. Please arrange payment at your '
        'earliest convenience. Thank you.'
    ),
)
whatsapp_template_promise_today = models.TextField(
    blank=True,
    default=(
        'Hello {name}, you promised to pay {amount} today at {business}. '
        'Kindly visit us or send the payment via mobile money. Thank you.'
    ),
)
whatsapp_template_receipt = models.TextField(
    blank=True,
    default=(
        'Hi {name}, thank you for your purchase at {business}.\n\n'
        'Receipt #: {reference}\nTotal: {amount}\nPaid: {paid}\nBalance: {balance}\n\n'
        'We appreciate your business!'
    ),
)