from rest_framework import serializers
from django.db import transaction
from .models import Purchase, PurchaseItem
from apps.inventory.models import StockMovement


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_cost', 'subtotal']


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Purchase
        fields = ['id', 'reference', 'supplier', 'supplier_name', 'status',
                  'total_amount', 'amount_paid', 'balance', 'notes',
                  'items', 'created_at']
        read_only_fields = ['user', 'created_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        total = sum(i['quantity'] * i['unit_cost'] for i in items_data)
        with transaction.atomic():
            purchase = Purchase.objects.create(total_amount=total, **validated_data)
            for item in items_data:
                PurchaseItem.objects.create(purchase=purchase, **item)
            # Auto stock in if received
            if purchase.status == 'received':
                for item in purchase.items.all():
                    product = item.product
                    product.quantity += item.quantity
                    product.save()
                    StockMovement.objects.create(
                        product=product, movement_type='in',
                        quantity=item.quantity, reference=purchase.reference,
                        user=purchase.user
                    )
        return purchase

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        old_status = instance.status
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if items_data is not None:
            instance.items.all().delete()
            total = 0
            for item in items_data:
                PurchaseItem.objects.create(purchase=instance, **item)
                total += item['quantity'] * item['unit_cost']
            instance.total_amount = total
        instance.save()

        # If status changed to received, update stock
        if old_status != 'received' and instance.status == 'received':
            for item in instance.items.all():
                product = item.product
                product.quantity += item.quantity
                product.save()
                StockMovement.objects.create(
                    product=product, movement_type='in',
                    quantity=item.quantity, reference=instance.reference,
                    user=instance.user
                )
        return instance