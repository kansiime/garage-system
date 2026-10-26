from django.contrib import admin
from .models import CashUp


@admin.register(CashUp)
class CashUpAdmin(admin.ModelAdmin):
    list_display = ['date', 'expected_cash', 'counted_cash', 'difference', 'user']
