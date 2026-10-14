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
    """
    Allow access based on `allowed_roles` on the view. If the view also sets
    `write_roles`, unsafe methods (POST/PUT/PATCH/DELETE) are limited to those
    roles, except for actions listed in `open_write_actions`.
    """
    SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        role = getattr(request.user, 'role', None)
        allowed = getattr(view, 'allowed_roles', None)
        if allowed and role not in allowed:
            return False
        write_roles = getattr(view, 'write_roles', None)
        if write_roles and request.method not in self.SAFE_METHODS:
            if getattr(view, 'action', None) in getattr(view, 'open_write_actions', ()):
                return True
            return role in write_roles
        return True