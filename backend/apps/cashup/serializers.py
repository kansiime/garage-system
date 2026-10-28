from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from .models import CashUp
from .services import day_summary

# UGX notes and coins counted at closing
DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50]
# Methods whose balance can be checked alongside the cash drawer
CHECKED_ACCOUNTS = ('mobile', 'bank')


class CashUpSerializer(serializers.ModelSerializer):
    recorded_by = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = CashUp
        fields = ['id', 'date', 'opening_cash', 'cash_in', 'cash_out', 'expected_cash',
                  'counted_cash', 'difference', 'left_in_drawer', 'banked', 'to_owner',
                  'denominations', 'accounts', 'summary', 'notes',
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

    def validate_denominations(self, value):
        clean = {}
        for note, qty in (value or {}).items():
            if not str(note).isdigit() or int(note) not in DENOMINATIONS:
                raise serializers.ValidationError(f'{note} is not a note or coin.')
            if not isinstance(qty, int) or qty < 0:
                raise serializers.ValidationError(f'Count for {note} must be a whole number.')
            if qty:
                clean[str(note)] = qty
        return clean

    def validate_accounts(self, value):
        # Input: {"mobile": {"opening": 1000, "counted": 5000}, ...}; blank ones are skipped
        clean = {}
        for method, check in (value or {}).items():
            if method not in CHECKED_ACCOUNTS or not isinstance(check, dict):
                raise serializers.ValidationError(f'{method} cannot be checked here.')
            if check.get('counted') in (None, ''):
                continue
            try:
                opening = Decimal(str(check.get('opening') or 0))
                counted = Decimal(str(check['counted']))
            except ArithmeticError:
                raise serializers.ValidationError(f'Enter amounts for {method}.')
            if opening < 0 or counted < 0:
                raise serializers.ValidationError(f'{method} amounts cannot be negative.')
            clean[method] = {'opening': opening, 'counted': counted}
        return clean

    def validate(self, attrs):
        for field in ('opening_cash', 'counted_cash', 'left_in_drawer', 'banked', 'to_owner'):
            if attrs.get(field, Decimal('0')) < 0:
                raise serializers.ValidationError({field: 'Cannot be negative.'})
        counted = attrs['counted_cash']
        if attrs.get('left_in_drawer', Decimal('0')) > counted:
            raise serializers.ValidationError(
                {'left_in_drawer': 'Cannot leave more in the drawer than was counted.'})
        taken = counted - attrs.get('left_in_drawer', Decimal('0'))
        if attrs.get('banked', Decimal('0')) + attrs.get('to_owner', Decimal('0')) > taken:
            raise serializers.ValidationError(
                {'banked': f'Banked and given to owner add up to more than was taken ({taken:,.0f}).'})
        notes = attrs.get('denominations')
        if notes and sum(int(n) * q for n, q in notes.items()) != counted:
            raise serializers.ValidationError(
                {'denominations': 'The notes and coins do not add up to the cash counted.'})
        return attrs

    def create(self, validated_data):
        summary = day_summary(validated_data['date'])
        expected = validated_data.get('opening_cash', Decimal('0')) + summary['cash_in'] - summary['cash_out']
        net = {m['method']: m['net'] for m in summary['methods']}
        accounts = {}
        for method, check in validated_data.pop('accounts', {}).items():
            account_expected = check['opening'] + net[method]
            accounts[method] = {
                'opening': float(check['opening']), 'expected': float(account_expected),
                'counted': float(check['counted']),
                'difference': float(check['counted'] - account_expected),
            }
        return CashUp.objects.create(
            accounts=accounts,
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
