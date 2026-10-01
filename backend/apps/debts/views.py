from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from .models import Debt, DebtPayment
from .serializers import DebtSerializer, DebtPaymentSerializer, RecordPaymentSerializer
from apps.accounts.permissions import RoleBasedPermission


class DebtViewSet(viewsets.ModelViewSet):
    queryset = Debt.objects.all().order_by('-id')
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'cashier']

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        debt = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            DebtPayment.objects.create(
                debt=debt,
                amount=serializer.validated_data['amount'],
                notes=serializer.validated_data.get('notes', ''),
                user=request.user
            )
            debt.amount_paid += serializer.validated_data['amount']
            debt.save()
            debt.update_status()
        return Response(DebtSerializer(debt).data)