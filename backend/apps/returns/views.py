from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Return
from .serializers import ReturnSerializer
from apps.accounts.permissions import RoleBasedPermission


class ReturnViewSet(viewsets.ModelViewSet):
    queryset = Return.objects.select_related('user').all()
    serializer_class = ReturnSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'cashier', 'storekeeper']

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('type'):
            qs = qs.filter(return_type=p['type'])
        if p.get('search'):
            s = p['search']
            qs = qs.filter(reference__icontains=s) | qs.filter(party_name__icontains=s)
        return qs