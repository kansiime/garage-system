from rest_framework.routers import DefaultRouter
from .views import ReturnViewSet

router = DefaultRouter()
router.register('', ReturnViewSet, basename='returns')
urlpatterns = router.urls