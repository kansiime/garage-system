from django.contrib import admin
from .models import Return, ReturnItem


class ReturnItemInline(admin.TabularInline):
    model = ReturnItem
    extra = 1


@admin.register(Return)
class ReturnAdmin(admin.ModelAdmin):
    list_display = ['reference', 'return_type', 'party_name', 'resolution', 'total_amount', 'created_at']
    list_filter = ['return_type', 'resolution']
    inlines = [ReturnItemInline]