from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.inventory.models import Product, Supplier


class DashboardTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='x', role='admin')
        self.client.force_authenticate(self.admin)
        self.supplier = Supplier.objects.create(name='Papa')
        self.oil = Product.objects.create(name='Oil', sku='OIL', cost_price=60,
                                          selling_price=100, quantity=50)

    def buy(self, ref, cost):
        res = self.client.post('/api/purchases/', {
            'reference': ref, 'supplier': self.supplier.id, 'status': 'pending',
            'amount_paid': 0,
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_cost': cost}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_cancelled_purchases_are_not_counted(self):
        self.buy('PO-1', 300)
        cancelled = self.buy('PO-2', 500)
        self.client.patch(f'/api/purchases/{cancelled["id"]}/', {'status': 'cancelled'}, format='json')
        data = self.client.get('/api/reports/dashboard/').data
        self.assertEqual(data['purchases_today'], 300)
        self.assertEqual(data['payables'], 300)
        overview = self.client.get('/api/reports/overview/?period=today').data
        self.assertEqual(overview['kpis']['total_purchases'], 300)

    def test_trend_covers_seven_days_with_today_last(self):
        self.client.post('/api/sales/', {
            'reference': 'SL-1', 'amount_paid': 200,
            'items': [{'product': self.oil.id, 'quantity': 2, 'unit_price': 100}],
        }, format='json')
        trend = self.client.get('/api/reports/dashboard/').data['trend']
        self.assertEqual(len(trend), 7)
        self.assertEqual(trend[-1]['total'], 200)
        self.assertEqual(trend[-1]['profit'], 80)
        self.assertEqual(sum(d['total'] for d in trend[:-1]), 0)
