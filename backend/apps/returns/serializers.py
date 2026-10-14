from rest_framework import serializers
from django.db import transaction
from decimal import Decimal

from .models import Return, ReturnItem
from apps.inventory.models import StockMovement
from apps.debts import services
from apps.sales.models import Sale, SaleItem
from apps.purchases.models import Purchase, PurchaseItem
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

    def validate(self, attrs):
        items = attrs.get('items') or []
        if not items:
            raise serializers.ValidationError({'items': 'Add at least one item.'})
        for i in items:
            if i['quantity'] <= 0:
                raise serializers.ValidationError({'items': 'Quantities must be at least 1.'})
            if i['unit_price'] < 0:
                raise serializers.ValidationError({'items': 'Prices cannot be negative.'})

        ref = (attrs.get('original_reference') or '').strip()
        if attrs.get('return_type') == 'sales':
            sale = attrs.get('original_sale') or (Sale.objects.filter(reference=ref).first() if ref else None)
            if sale:
                attrs['original_sale'] = sale
                attrs['original_reference'] = sale.reference
                sold = SaleItem.objects.filter(sale=sale)
                prior = ReturnItem.objects.filter(return_record__original_sale=sale)
                line_kind = 'sold on'
            else:
                sold = prior = None
        else:
            purchase = attrs.get('original_purchase') or (
                Purchase.objects.filter(reference=ref).first() if ref else None)
            if purchase:
                attrs['original_purchase'] = purchase
                if purchase.status != 'received':
                    raise serializers.ValidationError(
                        {'original_reference': 'Only received purchases can be returned.'})
            for i in items:
                if i['product'].quantity < sum(x['quantity'] for x in items if x['product'].id == i['product'].id):
                    raise serializers.ValidationError(
                        {'items': f"{i['product'].name}: only {i['product'].quantity} in stock to send back."})
            sold = PurchaseItem.objects.filter(purchase=purchase) if purchase else None
            prior = ReturnItem.objects.filter(return_record__original_purchase=purchase) if purchase else None
            line_kind = 'bought on'
            if purchase:
                attrs['original_reference'] = purchase.reference

        if sold is not None:
            # Can't return more than was sold/bought (minus earlier returns)
            for i in items:
                pid = i['product'].id
                had = sum(x.quantity for x in sold if x.product_id == pid)
                back = sum(x.quantity for x in prior if x.product_id == pid)
                asked = sum(x['quantity'] for x in items if x['product'].id == pid)
                prices = [x.unit_price if hasattr(x, 'unit_price') else x.unit_cost
                          for x in sold if x.product_id == pid]
                if prices and i['unit_price'] > max(prices):
                    raise serializers.ValidationError({'items': (
                        f"{i['product'].name}: return price {i['unit_price']:,.2f} is higher than "
                        f"the original {max(prices):,.2f}."
                    )})
                if asked > had - back:
                    raise serializers.ValidationError({'items': (
                        f"{i['product'].name}: only {had - back} left to return "
                        f"({had} {line_kind} {attrs['original_reference']}, {back} already returned)."
                    )})
        elif attrs.get('resolution') == 'credit':
            raise serializers.ValidationError(
                {'original_reference': 'Give the original sale/purchase reference to credit a debt.'}
            )
        return attrs

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

            # Adjust debts: reduce the balance owed on the original sale/purchase
            if r.resolution == 'credit' and r.original_reference:
                debt_type = 'receivable' if r.return_type == 'sales' else 'payable'
                services.credit_by_reference(
                    debt_type, r.original_reference, total,
                    user=r.user, notes=f'Return {r.reference}',
                )

            log(self.context['request'], 'create', 'Return', r.id,
                f'{r.get_return_type_display()} {r.reference} — {total}')

        return r