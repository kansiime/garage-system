from rest_framework.routers import DefaultRouter
from .views import (CategoryViewSet, SupplierViewSet, ProductViewSet,
                    StockMovementViewSet, StockReconciliationViewSet)

router = DefaultRouter()
router.register('categories', CategoryViewSet)
router.register('suppliers', SupplierViewSet)
router.register('products', ProductViewSet)
router.register('movements', StockMovementViewSet)
router.register('reconciliations', StockReconciliationViewSet)

urlpatterns = router.urls