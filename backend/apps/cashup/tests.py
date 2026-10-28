from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.cashup.models import CashUp
from apps.expenses.models import Expense
from apps.inventory.models import Product, Supplier


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

    def test_change_after_cash_up_is_reported(self):
        self.sell(200)
        today = timezone.localdate().isoformat()
        self.client.post('/api/cashup/', {'date': today, 'counted_cash': 200}, format='json')
        self.assertEqual(self.day()['changes'], [])
        self.sell(200)
        [change] = self.day()['changes']
        self.assertEqual((change['method'], change['in_then'], change['in_now']), ('cash', 200, 400))

    def test_missed_days_only_flags_days_with_money_after_first_cash_up(self):
        today = timezone.localdate()
        CashUp.objects.create(date=today - timedelta(days=5), counted_cash=0)
        for ago in (10, 3):   # before the first cash-up / after it
            Expense.objects.create(description='Fuel', amount=20, payment_method='cash',
                                   expense_date=today - timedelta(days=ago))
        self.assertEqual(self.client.get('/api/cashup/missed/').data['days'],
                         [today - timedelta(days=3)])

    def test_only_admin_can_enter_into_cashed_up_day(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        CashUp.objects.create(date=yesterday, counted_cash=0)
        supplier = Supplier.objects.create(name='Papa')
        store = User.objects.create_user('store', password='x', role='storekeeper')

        def buy(user, ref):
            self.client.force_authenticate(user)
            return self.client.post('/api/purchases/', {
                'reference': ref, 'supplier': supplier.id, 'purchase_date': yesterday.isoformat(),
                'items': [{'product': self.oil.id, 'quantity': 1, 'unit_cost': 10}],
            }, format='json')
        self.assertEqual(buy(store, 'PO-1').status_code, 400)
        self.assertEqual(buy(self.admin, 'PO-2').status_code, 201)

    def test_notes_where_cash_went_and_account_checks(self):
        self.sell(200)
        self.sell(200, method='mobile')
        today = timezone.localdate().isoformat()
        post = lambda **extra: self.client.post('/api/cashup/', {
            'date': today, 'counted_cash': 200, 'left_in_drawer': 50, **extra}, format='json')

        self.assertIn('denominations', post(denominations={'100': 1}).data)
        self.assertIn('banked', post(banked=100, to_owner=100).data)
        res = post(denominations={'100': 2}, banked=100, to_owner=50,
                   accounts={'mobile': {'opening': 1000, 'counted': 1250}, 'bank': {'counted': ''}})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['accounts'], {'mobile': {
            'opening': 1000.0, 'expected': 1200.0, 'counted': 1250.0, 'difference': 50.0}})
