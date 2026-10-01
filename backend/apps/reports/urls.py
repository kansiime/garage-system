from django.urls import path
from . import views


urlpatterns = [
    path('dashboard/', views.dashboard_summary),
    path('overview/', views.reports_overview),
    path('sales/', views.sales_report),
    path('purchases/', views.purchases_report),
    path('stock/', views.stock_report),
    path('debts/', views.debts_report),
    path('profit/', views.profit_report),
    path('expenses/', views.expenses_report),
    path('returns/', views.returns_report),
]