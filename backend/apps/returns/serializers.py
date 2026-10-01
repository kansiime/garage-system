from rest_framework import serializers
from django.db import transaction
from decimal import Decimal

from .models import Return, ReturnItem
from apps.inventory.models import StockMovement
from apps.debts.models import Debt
from apps.accounts.audit import log


class ReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = ReturnItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_price', 'subtotal']


class ReturnSerializer(serializers.ModelSerializer):
    items = ReturnItemSerializer(many=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Return
        fields = [
            'id', 'reference', 'return_type', 'resolution',
            'party_name', 'party_phone', 'original_reference',
            'original_sale', 'original_purchase',
            'total_amount', 'reason', 'notes',
            'items', 'username', 'created_at',
        ]
        read_only_fields = ['user', 'created_at', 'total_amount']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        total = sum(
            Decimal(i['quantity']) * Decimal(i['unit_price']) for i in items_data
        )

        with transaction.atomic():
            r = Return.objects.create(
                total_amount=total,
                user=self.context['request'].user,
                **validated_data,
            )

            for item in items_data:
                ReturnItem.objects.create(return_record=r, **item)
                product = item['product']

                if r.return_type == 'sales':
                    # Customer returned goods → stock goes UP
                    product.quantity += item['quantity']
                    product.save()
                    StockMovement.objects.create(
                        product=product, movement_type='in',
                        quantity=item['quantity'],
                        reference=f'RETURN {r.reference}',
                        notes=f'Sales return: {r.reason[:100]}',
                        user=r.user,
                    )
                else:
                    # We return goods to supplier → stock goes DOWN
                    product.quantity -= item['quantity']
                    product.save()
                    StockMovement.objects.create(
                        product=product, movement_type='out',
                        quantity=item['quantity'],
                        reference=f'RETURN {r.reference}',
                        notes=f'Purchase return: {r.reason[:100]}',
                        user=r.user,
                    )

            # Adjust debts
            if r.resolution == 'credit':
                if r.return_type == 'sales':
                    # Reduce customer's receivable
                    debt = Debt.objects.filter(
                        debt_type='receivable', reference=r.original_reference,
                    ).exclude(status='paid').first()
                    if debt:
                        debt.amount_paid += total
                        if debt.amount_paid > debt.amount:
                            debt.amount_paid = debt.amount
                        debt.save()
                        debt.update_status()
                else:
                    # Reduce our payable to supplier
                    debt = Debt.objects.filter(
                        debt_type='payable', reference=r.original_reference,
                    ).exclude(status='paid').first()
                    if debt:
                        debt.amount_paid += total
                        if debt.amount_paid > debt.amount:
                            debt.amount_paid = debt.amount
                        debt.save()
                        debt.update_status()

            log(self.context['request'], 'create', 'Return', r.id,
                f'{r.get_return_type_display()} {r.reference} — {total}')

        return r