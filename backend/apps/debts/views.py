from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from .models import Debt, DebtPayment
from .serializers import DebtSerializer, RecordPaymentSerializer
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log


class DebtViewSet(viewsets.ModelViewSet):
    queryset = Debt.objects.all().order_by('-id')
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'cashier']
    write_roles = ['admin', 'manager']

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        debt = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data['amount']
        with transaction.atomic():
            DebtPayment.objects.create(
                debt=debt, amount=amount,
                notes=serializer.validated_data.get('notes', ''),
                user=request.user,
            )
            debt.amount_paid += amount
            debt.save()
            debt.update_status()
        log(request, 'payment', 'Debt', debt.id,
            f'Payment {amount} for {debt.party_name}')
        return Response(DebtSerializer(debt).data)

    @action(detail=False, methods=['get'])
    def promises(self, request):
        """Return debts with promised_date today or in the past (still unpaid)."""
        today = timezone.localtime().date()
        qs = self.get_queryset().filter(
            promised_date__isnull=False,
            promised_date__lte=today,
        ).exclude(status='paid').order_by('promised_date')

        overdue = qs.filter(promised_date__lt=today)
        due_today = qs.filter(promised_date=today)

        return Response({
            'overdue': DebtSerializer(overdue, many=True).data,
            'due_today': DebtSerializer(due_today, many=True).data,
            'overdue_count': overdue.count(),
            'due_today_count': due_today.count(),
            'total_due': overdue.count() + due_today.count(),
        })