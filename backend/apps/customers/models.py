import re

from django.conf import settings
from django.db import models


def name_key(name):
    return ' '.join((name or '').split()).lower()


def phone_key(phone):
    digits = re.sub(r'\D', '', phone or '')
    # Compare on the local part so 0772123456 == +256772123456
    return digits[-9:] if len(digits) >= 9 else digits


class Customer(models.Model):
    """
    One person or business we sell to. Sales and receivable debts point here,
    so a customer has one history and one balance however their name was typed.
    """
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    # Normalised copies used for matching (see services.find_or_create)
    name_key = models.CharField(max_length=200, db_index=True, editable=False)
    phone_key = models.CharField(max_length=20, db_index=True, blank=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def save(self, *args, **kwargs):
        self.name = ' '.join((self.name or '').split())
        self.phone = (self.phone or '').strip()
        self.name_key = name_key(self.name)
        self.phone_key = phone_key(self.phone)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.phone})" if self.phone else self.name
