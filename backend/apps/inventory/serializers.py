from rest_framework import serializers
from .models import Category, Supplier, Product, StockMovement, StockReconciliation


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = Product
        fields = '__all__'

    def create(self, validated_data):
        """Allow 'quantity' on create, and log an initial StockMovement."""
        quantity = validated_data.pop('quantity', 0)
        product = Product.objects.create(quantity=quantity, **validated_data)

        # Log the opening stock as a movement so it appears in history
        if quantity:
            request = self.context.get('request')
            StockMovement.objects.create(
                product=product,
                movement_type='in',
                quantity=quantity,
                reference='Opening stock',
                notes='Set during product creation',
                user=request.user if request and request.user.is_authenticated else None,
            )
        return product

    def update(self, instance, validated_data):
        """Prevent changing quantity via product edit — must use StockMovement."""
        validated_data.pop('quantity', None)
        return super().update(instance, validated_data)


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = ['user', 'created_at']


class StockReconciliationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = StockReconciliation
        fields = '__all__'
        read_only_fields = ['user', 'difference', 'created_at', 'system_quantity']