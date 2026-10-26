from django.contrib import admin
from .models import Debt, DebtCharge, DebtFollowUp, DebtPayment

class DebtChargeInline(admin.TabularInline):
    model = DebtCharge
    extra = 0

class DebtPaymentInline(admin.TabularInline):
    model = DebtPayment
    extra = 0

class DebtFollowUpInline(admin.TabularInline):
    # Follow-ups are a record of contact: view only, even in admin
    model = DebtFollowUp
    extra = 0
    readonly_fields = ['contacted_on', 'method', 'note', 'promised_date', 'user', 'created_at']

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    inlines = [DebtChargeInline, DebtPaymentInline, DebtFollowUpInline]
    list_display = ['party_name', 'debt_type', 'amount', 'amount_paid', 'status']
