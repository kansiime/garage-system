from rest_framework.routers import DefaultRouter
from .views import ExpenseViewSet, ExpenseCategoryViewSet

router = DefaultRouter()
router.register('categories', ExpenseCategoryViewSet, basename='expense-categories')
router.register('', ExpenseViewSet, basename='expenses')

urlpatterns = router.urls