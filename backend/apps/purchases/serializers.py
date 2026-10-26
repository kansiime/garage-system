from rest_framework import serializers
from django.db import transaction
from decimal import Decimal

from .models import Purchase, PurchaseItem
from apps.inventory.models import StockMovement


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_cost', 'subtotal']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be at least 1.')
        return value

    def validate_unit_cost(self, value):
        if value < 0:
            raise serializers.ValidationError('Cost cannot be negative.')
        return value


def _stock_in(purchase):
    for item in purchase.items.select_related('product'):
        product = item.product
        product.quantity += item.quantity
        product.save(update_fields=['quantity', 'updated_at'])
        StockMovement.objects.create(
            product=product, movement_type='in',
            quantity=item.quantity, reference=purchase.reference,
            user=purchase.user,
        )


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Purchase
        fields = ['id', 'reference', 'supplier', 'supplier_name', 'status',
                  'total_amount', 'amount_paid', 'paid_at_purchase', 'payment_method',
                  'balance', 'notes',
                  'items', 'created_at']
        read_only_fields = ['user', 'created_at', 'total_amount', 'paid_at_purchase']

    def validate(self, attrs):
        if self.instance is None:
            items = attrs.get('items') or []
            if not items:
                raise serializers.ValidationError({'items': 'Add at least one item.'})
            total = sum((Decimal(i['quantity']) * i['unit_cost'] for i in items), Decimal('0'))
            paid = attrs.get('amount_paid') or Decimal('0')
            if paid < 0:
                raise serializers.ValidationError({'amount_paid': 'Amount paid cannot be negative.'})
            if paid > total:
                raise serializers.ValidationError(
                    {'amount_paid': f'Amount paid ({paid:,.2f}) is more than the total ({total:,.2f}).'}
                )
            if paid < total and not attrs.get('supplier'):
                raise serializers.ValidationError(
                    {'supplier': 'Pick a supplier when the purchase is not fully paid.'}
                )
            attrs['_total'] = total
        return attrs

    def create(self, validated_data):
        from apps.debts import services

        items_data = validated_data.pop('items')
        total = validated_data.pop('_total')
        with transaction.atomic():
            purchase = Purchase.objects.create(
                total_amount=total, paid_at_purchase=validated_data.get('amount_paid') or 0,
                **validated_data)
            for item in items_data:
                PurchaseItem.objects.create(purchase=purchase, **item)
            if purchase.status == 'received':
                _stock_in(purchase)
            # Unpaid balance goes onto the supplier's running payable
            if purchase.balance > 0:
                services.add_charge(
                    debt_type='payable',
                    party_name=purchase.supplier.name,
                    party_phone=purchase.supplier.phone or '',
                    amount=purchase.balance,
                    reference=purchase.reference,
                    purchase=purchase,
                    notes=f'Balance from purchase {purchase.reference}',
                    user=purchase.user,
                )
        return purchase

    def update(self, instance, validated_data):
        """
        Only status and notes can change after creation. Items/amounts are
        locked because stock and the supplier debt were already booked.
        """
        locked = {'items', 'amount_paid', 'payment_method', 'supplier', 'reference'} & set(validated_data)
        changed = [f for f in locked
                   if f == 'items' or validated_data[f] != getattr(instance, f)]
        if changed:
            raise serializers.ValidationError(
                {'detail': f'Cannot change {", ".join(sorted(changed))} after a purchase is saved. '
                           'Pay the supplier from Debts, or record a return.'}
            )
        old_status = instance.status
        new_status = validated_data.get('status', old_status)
        if old_status != new_status and old_status != 'pending':
            raise serializers.ValidationError(
                {'status': f'A {old_status} purchase cannot be changed to {new_status}.'}
            )
        with transaction.atomic():
            instance.status = new_status
            instance.notes = validated_data.get('notes', instance.notes)
            instance.save(update_fields=['status', 'notes'])
            if old_status == 'pending' and new_status == 'received':
                _stock_in(instance)
            if old_status == 'pending' and new_status == 'cancelled':
                # Nothing was delivered, so we no longer owe the unpaid part
                from apps.debts import services
                services.write_off_purchase(instance, user=instance.user)
        return instance
