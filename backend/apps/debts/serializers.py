from rest_framework import serializers
from django.db import transaction
from .models import Debt, DebtPayment


class DebtPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebtPayment
        fields = ['id', 'debt', 'amount', 'notes', 'created_at']
        read_only_fields = ['user', 'created_at']


class DebtSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    promise_status = serializers.CharField(read_only=True)
    payments = DebtPaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Debt
        fields = [
            'id', 'debt_type', 'party_name', 'party_phone', 'amount',
            'amount_paid', 'balance', 'status', 'reference', 'notes',
            'promised_date', 'promise_status', 'payments', 'created_at',
        ]
        read_only_fields = ['user', 'status', 'amount_paid', 'created_at', 'promise_status']


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True)