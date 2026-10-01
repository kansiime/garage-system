from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsAdminOrManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'manager']


class IsAdminManagerOrStorekeeper(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'manager', 'storekeeper']


class RoleBasedPermission(BasePermission):
    """Allow access based on allowed_roles on view"""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        allowed = getattr(view, 'allowed_roles', None)
        if not allowed:
            return True
        return request.user.role in allowed