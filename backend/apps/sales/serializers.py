from rest_framework import serializers
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from datetime import datetime
from decimal import Decimal

from .models import Sale, SaleItem
from apps.inventory.models import Product, StockMovement


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    profit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_price',
                  'cost_price', 'subtotal', 'profit']
        read_only_fields = ['cost_price']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be at least 1.')
        return value

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError('Price cannot be negative.')
        return value


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    # Live debt info for this sale (from its debt charge)
    debt_balance = serializers.SerializerMethodField()
    debt_status = serializers.SerializerMethodField()
    debt_id = serializers.SerializerMethodField()

    # Admins can record a forgotten sale on an earlier day
    sale_date = serializers.DateField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Sale
        fields = [
            'id', 'reference', 'customer', 'customer_name', 'customer_phone',
            'payment_type', 'payment_method', 'paid_at_sale',
            'total_amount', 'amount_paid', 'balance',
            'debt_balance', 'debt_status', 'debt_id',
            'notes', 'items', 'created_at', 'sale_date',
        ]
        read_only_fields = ['user', 'created_at', 'total_amount', 'payment_type', 'paid_at_sale']

    def _charge(self, obj):
        charges = list(obj.debt_charges.all())
        return charges[0] if charges else None

    def get_debt_balance(self, obj):
        c = self._charge(obj)
        return float(c.balance) if c else 0

    def get_debt_status(self, obj):
        c = self._charge(obj)
        if not c:
            return 'settled'
        if c.balance <= 0:
            return 'paid'
        return 'partial' if c.amount_paid > 0 else 'open'

    def get_debt_id(self, obj):
        c = self._charge(obj)
        return c.debt_id if c else None

    def validate_sale_date(self, value):
        if value is None or value == timezone.localdate():
            return value
        request = self.context.get('request')
        if not request or getattr(request.user, 'role', None) != 'admin':
            raise serializers.ValidationError('Only an admin can record a sale on another date.')
        if value > timezone.localdate():
            raise serializers.ValidationError('Sale date cannot be in the future.')
        return value

    def validate(self, attrs):
        items = attrs.get('items') or []
        if not items:
            raise serializers.ValidationError({'items': 'Add at least one item.'})
        total = sum((Decimal(i['quantity']) * i['unit_price'] for i in items), Decimal('0'))
        paid = attrs.get('amount_paid') or Decimal('0')
        if paid < 0:
            raise serializers.ValidationError({'amount_paid': 'Amount paid cannot be negative.'})
        if paid > total:
            raise serializers.ValidationError(
                {'amount_paid': f'Amount paid ({paid:,.2f}) is more than the total ({total:,.2f}).'}
            )
        if attrs.get('customer'):
            # Picked from the customer list: the sale records their details
            attrs['customer_name'] = attrs['customer'].name
            attrs['customer_phone'] = attrs['customer'].phone
        attrs['customer_name'] = ' '.join((attrs.get('customer_name') or '').split())
        attrs['customer_phone'] = (attrs.get('customer_phone') or '').strip()
        if paid < total and not attrs['customer_name']:
            raise serializers.ValidationError(
                {'customer_name': 'Customer name is required when the sale is not fully paid.'}
            )
        # Derive payment type from the money, so it can't contradict it
        attrs['payment_type'] = 'cash' if paid >= total else ('credit' if paid == 0 else 'partial')
        attrs['_total'] = total
        return attrs

    def create(self, validated_data):
        from apps.customers.services import find_or_create
        from apps.debts import services

        items_data = validated_data.pop('items')
        total = validated_data.pop('_total')
        sale_date = validated_data.pop('sale_date', None)
        user = validated_data.get('user')
        with transaction.atomic():
            # Lock products and check stock before selling
            needed = {}
            for item in items_data:
                needed[item['product'].id] = needed.get(item['product'].id, 0) + item['quantity']
            products = {p.id: p for p in Product.objects.select_for_update().filter(id__in=needed)}
            short = [
                f"{p.name} (have {p.quantity}, need {needed[p.id]})"
                for p in products.values() if p.quantity < needed[p.id]
            ]
            if short:
                raise serializers.ValidationError({'items': 'Not enough stock: ' + '; '.join(short)})

            if not validated_data.get('customer'):
                validated_data['customer'] = find_or_create(
                    validated_data['customer_name'], validated_data['customer_phone'], user=user)
            sale = Sale.objects.create(
                total_amount=total, paid_at_sale=validated_data.get('amount_paid') or 0,
                **validated_data)
            movement_ids = []
            for item in items_data:
                product = products[item['product'].id]
                item['product'] = product
                SaleItem.objects.create(sale=sale, cost_price=product.cost_price, **item)
                product.quantity -= item['quantity']
                product.save(update_fields=['quantity', 'updated_at'])
                movement_ids.append(StockMovement.objects.create(
                    product=product, movement_type='out',
                    quantity=item['quantity'], reference=sale.reference,
                    user=user,
                ).id)

            # Any unpaid balance goes onto the customer's running debt
            if sale.balance > 0:
                debt, merged = services.add_charge(
                    debt_type='receivable',
                    party_name=sale.customer_name,
                    party_phone=sale.customer_phone,
                    amount=sale.balance,
                    reference=sale.reference,
                    sale=sale,
                    customer=sale.customer,
                    notes=f'Balance from sale {sale.reference} '
                          f'(total {sale.total_amount:,.2f}, paid {sale.amount_paid:,.2f})',
                    user=user,
                )
                sale._debt = debt
                sale._debt_merged = merged

            if sale_date and sale_date != timezone.localdate():
                self._backdate(sale, sale_date, movement_ids)
        return sale

    def _backdate(self, sale, sale_date, movement_ids):
        """Move the sale and everything it created onto `sale_date` (keeping the time of day)."""
        from apps.debts.models import Debt

        when = timezone.make_aware(datetime.combine(sale_date, timezone.localtime().time()))
        Sale.objects.filter(pk=sale.pk).update(created_at=when)
        StockMovement.objects.filter(id__in=movement_ids).update(created_at=when)
        sale.debt_charges.update(created_at=when)
        if hasattr(sale, '_debt') and not sale._debt_merged:
            # Brand-new debt that only holds this sale
            Debt.objects.filter(pk=sale._debt.pk).update(created_at=when)
        sale.created_at = when

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if hasattr(instance, '_debt'):
            data['debt_merged'] = instance._debt_merged
            data['customer_total_debt'] = float(instance._debt.balance)
        return data
