from rest_framework import serializers

from .models import Customer, name_key, phone_key


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'name', 'phone', 'notes', 'created_at']
        read_only_fields = ['created_at']

    def validate_name(self, value):
        value = ' '.join((value or '').split())
        if not value:
            raise serializers.ValidationError('Name is required.')
        return value

    def validate(self, attrs):
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        phone = attrs.get('phone', getattr(self.instance, 'phone', ''))
        others = Customer.objects.exclude(pk=getattr(self.instance, 'pk', None))
        p = phone_key(phone)
        if p:
            clash = others.filter(phone_key=p).first()
        else:
            clash = others.filter(name_key=name_key(name), phone_key='').first()
        if clash:
            raise serializers.ValidationError({'detail': (
                f'{clash.name} already has these details. '
                'If they are the same person, merge them instead.'
            )})
        return attrs


class MergeSerializer(serializers.Serializer):
    other = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
