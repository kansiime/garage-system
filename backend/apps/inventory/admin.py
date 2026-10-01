from django.contrib import admin
from .models import Category, Supplier, Product, StockMovement, StockReconciliation

admin.site.register(Category)
admin.site.register(Supplier)
admin.site.register(Product)
admin.site.register(StockMovement)
admin.site.register(StockReconciliation)