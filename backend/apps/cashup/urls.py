from rest_framework.routers import DefaultRouter
from .views import CashUpViewSet

router = DefaultRouter()
router.register('', CashUpViewSet, basename='cashup')
urlpatterns = router.urls
