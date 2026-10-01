from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Purchase
from .serializers import PurchaseSerializer
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log
from apps.debts.models import Debt


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.all().order_by('-id')
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        purchase = serializer.save(user=self.request.user)
        log(self.request, 'create', 'Purchase', purchase.id,
            f'Purchase {purchase.reference} — {purchase.total_amount}')

        # Auto-create a payable debt if there's an outstanding balance
        if purchase.balance and purchase.balance > 0:
            Debt.objects.create(
                debt_type='payable',
                party_name=(purchase.supplier.name if purchase.supplier else '') or f'Supplier ({purchase.reference})',
                party_phone=(purchase.supplier.phone if purchase.supplier else '') or '',
                amount=purchase.total_amount,
                amount_paid=purchase.amount_paid,
                reference=purchase.reference,
                notes=f'Auto-created from purchase {purchase.reference}',
                user=self.request.user,
                status=(
                    'paid' if purchase.amount_paid >= purchase.total_amount
                    else 'partial' if purchase.amount_paid > 0
                    else 'open'
                ),
            )