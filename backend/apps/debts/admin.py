from django.contrib import admin
from .models import Debt, DebtCharge, DebtPayment

class DebtChargeInline(admin.TabularInline):
    model = DebtCharge
    extra = 0

class DebtPaymentInline(admin.TabularInline):
    model = DebtPayment
    extra = 0

@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    inlines = [DebtChargeInline, DebtPaymentInline]
    list_display = ['party_name', 'debt_type', 'amount', 'amount_paid', 'status']
