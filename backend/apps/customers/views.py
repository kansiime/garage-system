from decimal import Decimal

from django.db import transaction
from django.db.models import Count, F, Max, Q, Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Customer
from .serializers import CustomerSerializer, MergeSerializer
from . import services
from apps.accounts.audit import log
from apps.accounts.models import GarageSettings
from apps.accounts.permissions import RoleBasedPermission
from apps.debts.models import Debt, DebtFollowUp, DebtPayment
from apps.sales.models import Sale

ZERO = Decimal('0')


def _local(dt, fmt='%Y-%m-%d %H:%M'):
    return timezone.localtime(dt).strftime(fmt) if dt else None


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'cashier']
    write_roles = ['admin', 'manager']
    open_write_actions = ['create']   # cashiers can register a new customer

    def get_queryset(self):
        qs = super().get_queryset()
        q = (self.request.query_params.get('search') or '').strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(phone__icontains=q))
        return qs

    def list(self, request, *args, **kwargs):
        customers = list(self.get_queryset())
        sales = {
            row['customer']: row for row in
            Sale.objects.filter(customer__in=customers).values('customer')
            .annotate(count=Count('id'), spent=Sum('total_amount'), last=Max('created_at'))
        }
        balances = {
            row['customer']: row['balance'] for row in
            Debt.objects.filter(customer__in=customers, debt_type='receivable').values('customer')
            .annotate(balance=Sum(F('amount') - F('amount_paid')))
        }
        rows = []
        for c in customers:
            s = sales.get(c.id, {})
            last = s.get('last') or c.created_at
            rows.append({
                'id': c.id, 'name': c.name, 'phone': c.phone,
                'sale_count': s.get('count', 0),
                'total_spent': float(s.get('spent') or ZERO),
                'balance': float(balances.get(c.id) or ZERO),
                'last_visit': _local(last), '_sort': last,
            })
        rows.sort(key=lambda r: r.pop('_sort'), reverse=True)
        shop = GarageSettings.load()
        return Response({
            'customers': rows, 'count': len(rows),
            'currency': shop.currency_symbol or shop.currency_code or 'UGX',
        })

    def retrieve(self, request, *args, **kwargs):
        c = self.get_object()
        sales = list(c.sales.order_by('-created_at'))
        debts = list(c.debts.filter(debt_type='receivable').order_by('-created_at'))
        payments = DebtPayment.objects.filter(debt__in=debts).order_by('-created_at')
        follow_ups = DebtFollowUp.objects.filter(debt__in=debts).select_related('user') \
            .order_by('-contacted_on', '-created_at')
        shop = GarageSettings.load()
        return Response({
            'id': c.id, 'name': c.name, 'phone': c.phone, 'notes': c.notes,
            'currency': shop.currency_symbol or shop.currency_code or 'UGX',
            'summary': {
                'sale_count': len(sales),
                'total_spent': float(sum((s.total_amount for s in sales), ZERO)),
                'outstanding': float(sum((d.balance for d in debts), ZERO)),
                'total_paid_on_debts': float(sum(
                    (p.amount for p in payments if p.method != 'adjustment'), ZERO)),
            },
            'sales': [{
                'id': s.id, 'reference': s.reference, 'date': _local(s.created_at),
                'total': float(s.total_amount), 'paid': float(s.amount_paid),
                'balance': float(s.balance), 'payment_type': s.payment_type,
            } for s in sales[:100]],
            'debts': [{
                'id': d.id, 'amount': float(d.amount), 'paid': float(d.amount_paid),
                'balance': float(d.balance), 'status': d.status,
                'reference': d.reference or '', 'notes': d.notes or '',
                'promised_date': d.promised_date.isoformat() if d.promised_date else None,
                'promise_status': d.promise_status,
                'created_at': _local(d.created_at, '%Y-%m-%d'),
            } for d in debts],
            'payments': [{
                'id': p.id, 'amount': float(p.amount), 'notes': p.notes or '',
                'method_display': p.get_method_display(),
                'date': _local(p.created_at), 'debt_id': p.debt_id,
            } for p in payments[:100]],
            'follow_ups': [{
                'id': f.id, 'contacted_on': f.contacted_on.isoformat(),
                'method_display': f.get_method_display(), 'note': f.note,
                'promised_date': f.promised_date.isoformat() if f.promised_date else None,
                'recorded_by': f.user.username if f.user else '',
                'logged_at': _local(f.created_at), 'debt_id': f.debt_id,
            } for f in follow_ups],
        })

    def perform_create(self, serializer):
        c = serializer.save(user=self.request.user)
        log(self.request, 'create', 'Customer', c.id, f'New customer {c.name}')

    def perform_update(self, serializer):
        with transaction.atomic():
            c = serializer.save()
            # Debts show the customer's current name and phone
            c.debts.update(party_name=c.name, party_phone=c.phone)
        log(self.request, 'update', 'Customer', c.id, f'Updated customer {c.name}')

    def perform_destroy(self, instance):
        if instance.sales.exists() or instance.debts.exists():
            raise ValidationError({'detail': 'This customer has sales or debts and cannot be deleted. '
                                             'Merge them into another customer instead.'})
        log(self.request, 'delete', 'Customer', instance.id, f'Deleted customer {instance.name}')
        instance.delete()

    @action(detail=True, methods=['post'])
    def merge(self, request, pk=None):
        """Merge customer `other` into this one (same person entered twice)."""
        keep = self.get_object()
        serializer = MergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        other = serializer.validated_data['other']
        if other.pk == keep.pk:
            raise ValidationError({'other': 'Pick a different customer to merge.'})
        name = other.name
        services.merge(keep, other)
        log(request, 'update', 'Customer', keep.id, f'Merged customer {name} into {keep.name}')
        return self.retrieve(request, pk=keep.pk)
