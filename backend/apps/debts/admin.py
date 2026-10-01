from django.contrib import admin
from .models import Debt, DebtPayment

class DebtPaymentInline(admin.TabularInline):
    model = DebtPayment
    extra = 0

@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    inlines = [DebtPaymentInline]
    list_display = ['party_name', 'debt_type', 'amount', 'amount_paid', 'status']