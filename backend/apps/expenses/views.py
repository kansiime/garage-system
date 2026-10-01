from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Expense, ExpenseCategory
from .serializers import ExpenseSerializer, ExpenseCategorySerializer
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager']


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.select_related('category', 'user').all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager']

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('start'):
            qs = qs.filter(expense_date__gte=p['start'])
        if p.get('end'):
            qs = qs.filter(expense_date__lte=p['end'])
        if p.get('category'):
            qs = qs.filter(category_id=p['category'])
        if p.get('search'):
            qs = qs.filter(description__icontains=p['search'])
        return qs

    def perform_create(self, serializer):
        expense = serializer.save(user=self.request.user)
        log(self.request, 'create', 'Expense', expense.id,
            f"Expense {expense.description} — {expense.amount}")

    def perform_update(self, serializer):
        expense = serializer.save()
        log(self.request, 'update', 'Expense', expense.id,
            f"Updated expense {expense.description}")

    def perform_destroy(self, instance):
        log(self.request, 'delete', 'Expense', instance.id,
            f"Deleted expense {instance.description} ({instance.amount})")
        instance.delete()