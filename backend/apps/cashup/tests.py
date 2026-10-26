from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.expenses.models import Expense
from apps.inventory.models import Product


class CashUpTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='x', role='admin')
        self.cashier = User.objects.create_user('cash', password='x', role='cashier')
        self.oil = Product.objects.create(name='Oil', sku='OIL', cost_price=10,
                                          selling_price=100, quantity=50)
        self.client.force_authenticate(self.cashier)
        self._n = 0

    def sell(self, paid, method='cash', name=''):
        self._n += 1
        res = self.client.post('/api/sales/', {
            'reference': f'SL-{self._n}', 'amount_paid': paid, 'payment_method': method,
            'customer_name': name,
            'items': [{'product': self.oil.id, 'quantity': 2, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def day(self):
        return self.client.get('/api/cashup/day/').data

    def methods(self):
        return {m['method']: (m['in'], m['out']) for m in self.day()['methods']}

    def test_money_is_totalled_by_method(self):
        self.sell(200)                                   # cash in 200
        credit = self.sell(50, method='mobile', name='Ann')   # mobile in 50, 150 owed
        self.client.post(f'/api/debts/{credit["debt_id"]}/record_payment/',
                         {'amount': 30, 'method': 'cash'}, format='json')
        Expense.objects.create(description='Lunch', amount=20, payment_method='cash',
                               expense_date=timezone.localdate())
        Expense.objects.create(description='Unpaid', amount=99, payment_method='credit',
                               expense_date=timezone.localdate())
        m = self.methods()
        self.assertEqual(m['cash'], (230, 20))
        self.assertEqual(m['mobile'], (50, 0))
        # Later debt payments don't change what was taken at the counter
        self.assertEqual(len([l for l in self.day()['lines'] if l['kind'] == 'Sale']), 2)

    def test_return_credited_to_debt_moves_no_money(self):
        sale = self.sell(0, name='Bo')
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/returns/', {
            'reference': 'RT-1', 'return_type': 'sales', 'resolution': 'credit',
            'original_reference': sale['reference'], 'party_name': 'Bo',
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.methods()['cash'], (0, 0))

    def test_cash_up_records_difference_and_carries_float(self):
        self.sell(200)
        today = timezone.localdate().isoformat()
        res = self.client.post('/api/cashup/', {
            'date': today, 'opening_cash': 50, 'counted_cash': 240, 'left_in_drawer': 50,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(float(res.data['expected_cash']), 250)
        self.assertEqual(float(res.data['difference']), -10)
        # One per day
        self.assertEqual(self.client.post('/api/cashup/', {
            'date': today, 'counted_cash': 1}, format='json').status_code, 400)

        self.client.force_authenticate(self.admin)
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        nxt = self.client.get(f'/api/cashup/day/?date={tomorrow}').data
        self.assertEqual(float(nxt['suggested_opening']), 50)

    def test_cashier_cannot_cash_up_earlier_day_or_delete(self):
        yesterday = (timezone.localdate() - timedelta(days=1)).isoformat()
        self.assertEqual(self.client.post('/api/cashup/', {
            'date': yesterday, 'counted_cash': 0}, format='json').status_code, 400)
        res = self.client.post('/api/cashup/', {
            'date': timezone.localdate().isoformat(), 'counted_cash': 0}, format='json')
        self.assertEqual(self.client.delete(f'/api/cashup/{res.data["id"]}/').status_code, 403)
