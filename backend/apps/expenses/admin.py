from django.contrib import admin
from .models import Expense, ExpenseCategory


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active']


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['expense_date', 'description', 'category', 'amount', 'payment_method', 'user']
    list_filter = ['category', 'payment_method', 'expense_date']
    search_fields = ['description', 'reference']