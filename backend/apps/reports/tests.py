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

    def test_debt_payments_received_are_shown_next_to_sales(self):
        res = self.client.post('/api/sales/', {
            'reference': 'SL-1', 'customer_name': 'Ann', 'amount_paid': 0,
            'items': [{'product': self.oil.id, 'quantity': 3, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        debt_id = res.data['debt_id']
        self.client.post(f'/api/debts/{debt_id}/record_payment/', {'amount': 120}, format='json')
        # An adjustment moves no money and supplier payments aren't money in
        from apps.debts.models import Debt, DebtPayment
        DebtPayment.objects.create(debt_id=debt_id, amount=50, method='adjustment')
        self.buy('PO-1', 400)
        payable = Debt.objects.get(debt_type='payable')
        self.client.post(f'/api/debts/{payable.id}/record_payment/', {'amount': 100}, format='json')

        data = self.client.get('/api/reports/dashboard/').data
        self.assertEqual(data['today']['total'], 300)
        self.assertEqual(data['debt_payments_today'], {'total': 120, 'count': 1})
        self.assertEqual(data['debt_payments_month']['total'], 120)
        self.assertEqual(data['trend'][-1]['debt_payments'], 120)
        kpis = self.client.get('/api/reports/overview/?period=today').data['kpis']
        self.assertEqual(kpis['debt_payments_received'], 120)
        self.assertEqual(kpis['debt_payments_count'], 1)

    def test_overview_lists_sales_and_debts_paid_for_each_day(self):
        from datetime import timedelta
        from django.utils import timezone
        from apps.debts.models import Debt, DebtPayment
        today = timezone.localdate()
        debt = Debt.objects.create(debt_type='receivable', party_name='Ann', amount=500)
        old = DebtPayment.objects.create(debt=debt, amount=200, method='cash')
        DebtPayment.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=2))
        DebtPayment.objects.create(debt=debt, amount=75, method='mobile')
        self.client.post('/api/sales/', {
            'reference': 'SL-1', 'amount_paid': 100,
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
        }, format='json')
        start = today - timedelta(days=3)
        daily = self.client.get(
            f'/api/reports/overview/?period=custom&start={start}&end={today}'
        ).data['daily_money_in']
        self.assertEqual([d['date'] for d in daily],
                         [str(start + timedelta(days=n)) for n in range(4)])
        self.assertEqual(daily[1]['debt_payments'], 200)
        self.assertEqual(daily[1]['sales'], 0)
        self.assertEqual(daily[3], {'date': str(today), 'sales': 100, 'debt_payments': 75,
                                    'debt_payments_count': 1, 'total': 175})


class ReturnsProfitTests(APITestCase):
    """A sales return only loses the margin (goods go back to stock);
    a purchase return doesn't touch profit."""

    def setUp(self):
        self.admin = User.objects.create_user('admin', password='x', role='admin')
        self.client.force_authenticate(self.admin)
        self.oil = Product.objects.create(name='Oil', sku='OIL', cost_price=60,
                                          selling_price=100, quantity=50)

    def ret(self, **data):
        res = self.client.post('/api/returns/', {
            'resolution': 'exchange',
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
            **data,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_sales_return_loses_only_the_margin(self):
        self.client.post('/api/sales/', {
            'reference': 'SL-1', 'amount_paid': 200,
            'items': [{'product': self.oil.id, 'quantity': 2, 'unit_price': 100}],
        }, format='json')
        # Cost price changes after the sale; the return uses the sale's cost
        Product.objects.filter(pk=self.oil.pk).update(cost_price=90)
        r = self.ret(reference='RT-1', return_type='sales', original_reference='SL-1')
        self.assertEqual(Decimal(r['items'][0]['cost_price']), 60)

        dash = self.client.get('/api/reports/dashboard/').data
        self.assertEqual(dash['returns_month']['profit_lost'], 40)
        self.assertEqual(dash['net_profit_month'], 80 - 40)
        kpis = self.client.get('/api/reports/overview/?period=today').data['kpis']
        self.assertEqual(kpis['total_returns'], 100)
        self.assertEqual(kpis['returns_profit_lost'], 40)
        self.assertEqual(kpis['net_profit'], 40)

    def test_unlinked_sales_return_uses_product_cost(self):
        self.ret(reference='RT-2', return_type='sales')
        kpis = self.client.get('/api/reports/overview/?period=today').data['kpis']
        self.assertEqual(kpis['returns_profit_lost'], 40)

    def test_purchase_return_does_not_reduce_profit(self):
        res = self.client.post('/api/returns/', {
            'reference': 'RT-3', 'return_type': 'purchase', 'resolution': 'refund',
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 60}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        kpis = self.client.get('/api/reports/overview/?period=today').data['kpis']
        self.assertEqual(kpis['returns_profit_lost'], 0)
        self.assertEqual(kpis['net_profit'], 0)
        self.assertEqual(self.client.get('/api/reports/dashboard/').data['net_profit_month'], 0)
