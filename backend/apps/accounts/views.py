from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate

from .models import User, GarageSettings, AuditLog
from .serializers import (
    UserSerializer, LoginSerializer,
    GarageSettingsSerializer, AuditLogSerializer,
)
from .permissions import IsAdmin
from .audit import log


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        username=serializer.validated_data['username'],
        password=serializer.validated_data['password'],
    )
    if not user:
        return Response({'error': 'Invalid credentials'}, status=401)

    # Audit log — safe here because `request` and `user` exist in this scope
    log(request, 'login', 'User', user.id, f'{user.username} logged in')

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    })


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-id')
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user).data)

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response(
                {'detail': "You can't deactivate yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = not user.is_active
        user.save()
        log(request, 'update', 'User', user.id,
            f"{'Activated' if user.is_active else 'Deactivated'} {user.username}")
        return Response({'id': user.id, 'is_active': user.is_active})


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def garage_settings(request):
    obj = GarageSettings.load()
    if request.method == 'GET':
        return Response(GarageSettingsSerializer(obj).data)
    if request.user.role not in ('admin', 'manager'):
        return Response({'detail': 'Not allowed'}, status=403)
    serializer = GarageSettingsSerializer(obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)
        action = self.request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)
        return qs[:500]