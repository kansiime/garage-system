from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/sales/', include('apps.sales.urls')),
    path('api/purchases/', include('apps.purchases.urls')),
    path('api/debts/', include('apps.debts.urls')),
    path('api/expenses/', include('apps.expenses.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/returns/', include('apps.returns.urls')),
]