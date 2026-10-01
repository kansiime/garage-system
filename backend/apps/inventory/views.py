from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q

from .models import Category, Supplier, Product, StockMovement, StockReconciliation
from .serializers import (
    CategorySerializer, SupplierSerializer, ProductSerializer,
    StockMovementSerializer, StockReconciliationSerializer,
)
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by('-id')
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper', 'cashier']

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(sku__icontains=search) |
                Q(category__name__icontains=search) |
                Q(supplier__name__icontains=search)
            )
        return qs


class StockMovementViewSet(viewsets.ModelViewSet):
    queryset = StockMovement.objects.all().order_by('-id')
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        movement = serializer.save(user=self.request.user)
        product = movement.product

        if movement.movement_type == 'in':
            product.quantity += movement.quantity
        elif movement.movement_type == 'out':
            product.quantity -= movement.quantity
        else:
            product.quantity = movement.quantity
        product.save()

        log(
            self.request,
            f'stock_{movement.movement_type}',
            'Product',
            product.id,
            f'{movement.movement_type.upper()} {movement.quantity} of {product.name} '
            f'(now {product.quantity} in stock)',
        )


class StockReconciliationViewSet(viewsets.ModelViewSet):
    queryset = StockReconciliation.objects.all().order_by('-id')
    serializer_class = StockReconciliationSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        product = serializer.validated_data['product']
        rec = serializer.save(user=self.request.user, system_quantity=product.quantity)

        log(
            self.request,
            'reconcile',
            'Product',
            product.id,
            f'Reconciled {product.name}: system {rec.system_quantity} → physical {rec.physical_quantity} '
            f'(difference {rec.difference})',
        )