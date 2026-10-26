from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Purchase
from .serializers import PurchaseSerializer
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log
from apps.debts import services
from apps.debts.models import DebtCharge
from apps.debts.serializers import RecordPaymentSerializer

# Paying suppliers or cancelling (which writes off what we owe) moves money
MONEY_ROLES = ('admin', 'manager')


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.all().order_by('-id')
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']
    # Deleting would orphan stock movements and supplier debts
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    def perform_create(self, serializer):
        purchase = serializer.save(user=self.request.user)
        log(self.request, 'create', 'Purchase', purchase.id,
            f'Purchase {purchase.reference} — {purchase.total_amount}')

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        new_status = serializer.validated_data.get('status', old_status)
        if (new_status == 'cancelled' and old_status != 'cancelled'
                and self.request.user.role not in MONEY_ROLES):
            raise PermissionDenied('Only an admin or manager can cancel a purchase.')
        purchase = serializer.save()
        if new_status != old_status:
            log(self.request, 'update', 'Purchase', purchase.id,
                f'Purchase {purchase.reference} {old_status} → {new_status}')

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Pay the supplier towards this purchase's unpaid balance."""
        if request.user.role not in MONEY_ROLES:
            raise PermissionDenied('Only an admin or manager can pay suppliers.')
        purchase = self.get_object()
        if purchase.status == 'cancelled':
            raise ValidationError({'amount': 'This purchase was cancelled.'})
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data['amount']

        charge = next((c for c in DebtCharge.objects.filter(purchase=purchase).order_by('id')
                       if c.balance > 0), None)
        if charge is None:
            raise ValidationError({'amount': 'Nothing is owed on this purchase.'
                                   if purchase.balance <= 0 else
                                   'This purchase has no linked supplier debt. Pay it from the Debts page.'})
        if amount > charge.balance:
            raise ValidationError(
                {'amount': f'Payment {amount:,.2f} is more than the balance {charge.balance:,.2f}.'}
            )
        services.record_payment(
            charge.debt_id, amount, user=request.user, prefer_charge_id=charge.id,
            method=serializer.validated_data['method'],
            notes=serializer.validated_data.get('notes') or f'Payment for purchase {purchase.reference}',
        )
        log(request, 'payment', 'Purchase', purchase.id,
            f'Paid {amount} to {purchase.supplier.name if purchase.supplier else "supplier"} '
            f'for {purchase.reference}')
        purchase.refresh_from_db()
        return Response(self.get_serializer(purchase).data)
