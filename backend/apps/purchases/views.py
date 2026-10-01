from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Purchase
from .serializers import PurchaseSerializer
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.all().order_by('-id')
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_create(self, serializer):
        purchase = serializer.save(user=self.request.user)
        log(self.request, 'create', 'Purchase', purchase.id,
            f'Purchase {purchase.reference} — {purchase.total_amount}')