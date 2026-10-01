from rest_framework import serializers
from django.db import transaction
from .models import Sale, SaleItem
from apps.inventory.models import StockMovement


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    profit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_price',
                  'cost_price', 'subtotal', 'profit']
        read_only_fields = ['cost_price']


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Sale
        fields = ['id', 'reference', 'customer_name', 'customer_phone',
                  'payment_type', 'total_amount', 'amount_paid', 'balance',
                  'notes', 'items', 'created_at']
        read_only_fields = ['user', 'created_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        total = sum(i['quantity'] * i['unit_price'] for i in items_data)
        with transaction.atomic():
            sale = Sale.objects.create(total_amount=total, **validated_data)
            for item in items_data:
                product = item['product']
                SaleItem.objects.create(
                    sale=sale,
                    cost_price=product.cost_price,
                    **item
                )
                # Reduce stock
                product.quantity -= item['quantity']
                product.save()
                StockMovement.objects.create(
                    product=product, movement_type='out',
                    quantity=item['quantity'], reference=sale.reference,
                    user=sale.user
                )
        return sale

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        # Restore old stock
        for old_item in instance.items.all():
            product = old_item.product
            product.quantity += old_item.quantity
            product.save()
        instance.items.all().delete()

        for k, v in validated_data.items():
            setattr(instance, k, v)

        total = 0
        if items_data is not None:
            for item in items_data:
                product = item['product']
                SaleItem.objects.create(
                    sale=instance,
                    cost_price=product.cost_price,
                    **item
                )
                product.quantity -= item['quantity']
                product.save()
                total += item['quantity'] * item['unit_price']
            instance.total_amount = total
        instance.save()
        return instance