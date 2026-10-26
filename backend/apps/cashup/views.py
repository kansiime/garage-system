from datetime import date

from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CashUp
from .serializers import CashUpSerializer
from .services import day_summary
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log


class CashUpViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    mixins.CreateModelMixin, mixins.DestroyModelMixin,
                    viewsets.GenericViewSet):
    """Saved cash-ups are not edited; an admin can delete one so the day can be redone."""
    queryset = CashUp.objects.select_related('user')
    serializer_class = CashUpSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'cashier']

    def perform_create(self, serializer):
        cash_up = serializer.save(user=self.request.user)
        log(self.request, 'create', 'CashUp', cash_up.id,
            f'Cash-up {cash_up.date}: counted {cash_up.counted_cash}, '
            f'expected {cash_up.expected_cash}, difference {cash_up.difference}')

    def perform_destroy(self, instance):
        if self.request.user.role != 'admin':
            raise PermissionDenied('Only an admin can delete a cash-up.')
        log(self.request, 'delete', 'CashUp', instance.id,
            f'Deleted cash-up {instance.date} (difference {instance.difference})')
        instance.delete()

    @action(detail=False, methods=['get'])
    def day(self, request):
        """Money in and out for ?date= (default today), and its cash-up if saved."""
        try:
            day = date.fromisoformat(request.query_params.get('date', ''))
        except ValueError:
            day = timezone.localdate()
        previous = CashUp.objects.filter(date__lt=day).order_by('-date').first()
        saved = CashUp.objects.filter(date=day).first()
        return Response({
            **day_summary(day),
            'suggested_opening': previous.left_in_drawer if previous else 0,
            'previous_date': previous.date if previous else None,
            'cash_up': CashUpSerializer(saved).data if saved else None,
        })
