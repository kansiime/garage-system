from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Debt
from .serializers import DebtFollowUpSerializer, DebtSerializer, RecordPaymentSerializer
from . import services
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log


class DebtViewSet(viewsets.ModelViewSet):
    queryset = Debt.objects.prefetch_related(
        'payments__user', 'charges__user', 'charges__sale', 'charges__purchase',
        'follow_ups__user').order_by('-id')
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'cashier']
    write_roles = ['admin', 'manager']
    open_write_actions = ['record_payment', 'add_follow_up']   # cashiers can take payments and log contact

    def create(self, request, *args, **kwargs):
        """New credit for a party with an open debt is added to that debt."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        debt, merged = services.add_charge(
            debt_type=data['debt_type'],
            party_name=data['party_name'],
            party_phone=data.get('party_phone', ''),
            amount=data['amount'],
            reference=data.get('reference', ''),
            notes=data.get('notes', ''),
            promised_date=data.get('promised_date'),
            user=request.user,
        )
        log(request, 'create', 'Debt', debt.id,
            f"{'Added' if merged else 'New debt'} {data['amount']} for {debt.party_name}")
        body = DebtSerializer(debt).data
        body['merged'] = merged
        return Response(body, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        debt = serializer.instance
        new_amount = serializer.validated_data.pop('amount', None)
        with transaction.atomic():
            serializer.save()
            if new_amount is not None and new_amount != debt.amount:
                services.adjust_amount(debt, new_amount, user=self.request.user)
                old = debt.amount
                debt.refresh_from_db()
                log(self.request, 'update', 'Debt', debt.id,
                    f'Amount changed {old} → {debt.amount} for {debt.party_name}')

    def perform_destroy(self, instance):
        if instance.payments.exists():
            raise ValidationError({'detail': 'This debt has payments recorded and cannot be deleted.'})
        if instance.charges.filter(Q(sale__isnull=False) | Q(purchase__isnull=False)).exists():
            raise ValidationError({'detail': 'This debt comes from a sale or purchase and cannot be deleted. Record a return instead.'})
        if instance.follow_ups.exists():
            raise ValidationError({'detail': 'This debt has follow-up notes and cannot be deleted.'})
        log(self.request, 'delete', 'Debt', instance.id,
            f'Deleted debt {instance.amount} for {instance.party_name}')
        instance.delete()

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        debt = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data['amount']
        debt, _ = services.record_payment(
            debt.id, amount, user=request.user,
            notes=serializer.validated_data.get('notes', ''),
        )
        log(request, 'payment', 'Debt', debt.id,
            f'Payment {amount} for {debt.party_name}')
        return Response(DebtSerializer(debt).data)

    @action(detail=True, methods=['post'])
    def add_follow_up(self, request, pk=None):
        """Log a contact with the party; a promised date given here becomes the debt's."""
        debt = self.get_object()
        serializer = DebtFollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            follow_up = serializer.save(debt=debt, user=request.user)
            if follow_up.promised_date:
                debt.promised_date = follow_up.promised_date
                debt.save(update_fields=['promised_date'])
        log(request, 'create', 'Debt', debt.id,
            f'Follow-up ({follow_up.get_method_display()}) with {debt.party_name}')
        return Response(DebtSerializer(self.get_queryset().get(pk=debt.pk)).data,
                        status=status.HTTP_201_CREATED)

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
