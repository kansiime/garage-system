from rest_framework.routers import DefaultRouter
from .views import DebtViewSet

router = DefaultRouter()
router.register('', DebtViewSet, basename='debts')
urlpatterns = router.urls