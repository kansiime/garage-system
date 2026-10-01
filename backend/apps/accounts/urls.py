from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    login_view,
    UserViewSet,
    AuditLogViewSet,
    garage_settings,
    public_settings,
)

router = DefaultRouter()
router.register('users', UserViewSet, basename='users')
router.register('audit', AuditLogViewSet, basename='audit')

urlpatterns = [
    path('login/', login_view),
    path('refresh/', TokenRefreshView.as_view()),
    path('settings/', garage_settings),
    path('public-settings/', public_settings),
    path('', include(router.urls)),
]