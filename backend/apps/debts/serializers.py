from django.utils import timezone
from rest_framework import serializers
from .models import Debt, DebtCharge, DebtFollowUp, DebtPayment


class DebtPaymentSerializer(serializers.ModelSerializer):
    recorded_by = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = DebtPayment
        fields = ['id', 'debt', 'amount', 'notes', 'recorded_by', 'created_at']
        read_only_fields = ['user', 'created_at']


class DebtChargeSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    recorded_by = serializers.CharField(source='user.username', read_only=True, default='')

    class Meta:
        model = DebtCharge
        fields = ['id', 'amount', 'amount_paid', 'balance', 'reference',
                  'sale', 'purchase', 'notes', 'recorded_by', 'created_at']
        read_only_fields = fields


class DebtFollowUpSerializer(serializers.ModelSerializer):
    recorded_by = serializers.CharField(source='user.username', read_only=True, default='')
    method_display = serializers.CharField(source='get_method_display', read_only=True)

    class Meta:
        model = DebtFollowUp
        fields = ['id', 'contacted_on', 'method', 'method_display', 'note',
                  'promised_date', 'recorded_by', 'created_at']
        read_only_fields = ['created_at']

    def validate_note(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Write what was said.')
        return value

    def validate_contacted_on(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('The contact date cannot be in the future.')
        return value


class DebtSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    promise_status = serializers.CharField(read_only=True)
    payments = DebtPaymentSerializer(many=True, read_only=True)
    charges = DebtChargeSerializer(many=True, read_only=True)
    follow_ups = DebtFollowUpSerializer(many=True, read_only=True)

    class Meta:
        model = Debt
        fields = [
            'id', 'debt_type', 'party_name', 'party_phone', 'amount',
            'amount_paid', 'balance', 'status', 'reference', 'notes',
            'promised_date', 'promise_status', 'payments', 'charges', 'follow_ups',
            'created_at',
        ]
        read_only_fields = ['user', 'status', 'amount_paid', 'created_at', 'promise_status']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than 0.')
        return value

    def validate_party_name(self, value):
        value = ' '.join((value or '').split())
        if not value:
            raise serializers.ValidationError('Party name is required.')
        return value

    def validate_debt_type(self, value):
        # Changing type would turn money owed to us into money we owe (or vice versa)
        if self.instance and value != self.instance.debt_type:
            raise serializers.ValidationError('The debt type cannot be changed.')
        return value


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0.01)
    notes = serializers.CharField(required=False, allow_blank=True)
