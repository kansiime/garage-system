from .models import AuditLog


def log(request, action, model_name='', object_id='', description=''):
    try:
        user = request.user if request and request.user.is_authenticated else None
        AuditLog.objects.create(
            user=user, action=action, model_name=model_name,
            object_id=str(object_id), description=description,
        )
    except Exception:
        pass