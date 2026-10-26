from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from .models import CashUp
from .services import day_summary


class CashUpSerializer(serializers.ModelSerializer):
    recorded_by = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = CashUp
        fields = ['id', 'date', 'opening_cash', 'cash_in', 'cash_out', 'expected_cash',
                  'counted_cash', 'difference', 'left_in_drawer', 'summary', 'notes',
                  'recorded_by', 'created_at']
        read_only_fields = ['cash_in', 'cash_out', 'expected_cash', 'difference',
                            'summary', 'created_at']

    def validate_date(self, value):
        today = timezone.localdate()
        if value > today:
            raise serializers.ValidationError('You cannot cash up a day that has not happened.')
        request = self.context.get('request')
        if value != today and getattr(request.user, 'role', None) not in ('admin', 'manager'):
            raise serializers.ValidationError('Only an admin or manager can cash up an earlier day.')
        if CashUp.objects.filter(date=value).exists():
            raise serializers.ValidationError('This day has already been cashed up.')
        return value

    def validate(self, attrs):
        for field in ('opening_cash', 'counted_cash', 'left_in_drawer'):
            if attrs.get(field, Decimal('0')) < 0:
                raise serializers.ValidationError({field: 'Cannot be negative.'})
        if attrs.get('left_in_drawer', Decimal('0')) > attrs['counted_cash']:
            raise serializers.ValidationError(
                {'left_in_drawer': 'Cannot leave more in the drawer than was counted.'})
        return attrs

    def create(self, validated_data):
        summary = day_summary(validated_data['date'])
        expected = validated_data.get('opening_cash', Decimal('0')) + summary['cash_in'] - summary['cash_out']
        return CashUp.objects.create(
            cash_in=summary['cash_in'],
            cash_out=summary['cash_out'],
            expected_cash=expected,
            difference=validated_data['counted_cash'] - expected,
            summary={'methods': [
                {**m, 'in': float(m['in']), 'out': float(m['out']), 'net': float(m['net'])}
                for m in summary['methods']
            ]},
            **validated_data,
        )
