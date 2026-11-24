from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.debts.models import Debt
from apps.inventory.models import Product
from apps.sales.models import Sale


class CustomerTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='x', role='admin')
        self.cashier = User.objects.create_user('cash', password='x', role='cashier')
        self.oil = Product.objects.create(name='Oil', sku='OIL', cost_price=10,
                                          selling_price=100, quantity=50)
        self.client.force_authenticate(self.cashier)
        self._n = 0

    def sell(self, paid=0, **customer):
        self._n += 1
        res = self.client.post('/api/sales/', {
            'reference': f'SL-{self._n}', 'amount_paid': paid, **customer,
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_sales_by_same_phone_share_one_customer(self):
        a = self.sell(customer_name='Ntake', customer_phone='0772123456')
        b = self.sell(customer_name='FR NTAKE', customer_phone='+256 772 123456')
        self.assertEqual(a['customer'], b['customer'])
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(Debt.objects.get().customer_id, a['customer'])

    def test_walk_in_cash_sale_has_no_customer(self):
        self.assertIsNone(self.sell(paid=100)['customer'])
        self.assertEqual(Customer.objects.count(), 0)

    def test_picking_a_customer_uses_their_details(self):
        c = Customer.objects.create(name='Alfred', phone='0700000001')
        sale = self.sell(customer=c.id, customer_name='alf')
        self.assertEqual(sale['customer_name'], 'Alfred')
        self.assertEqual(sale['customer_phone'], '0700000001')
        self.assertEqual(Debt.objects.get().customer, c)

    def test_merge_moves_sales_and_combines_open_debts(self):
        a = self.sell(customer_name='Ntake')
        b = self.sell(customer_name='FR NTAKE')
        self.assertEqual(Debt.objects.count(), 2)
        url = f'/api/customers/{a["customer"]}/merge/'
        self.assertEqual(self.client.post(url, {'other': b['customer']}, format='json').status_code, 403)

        self.client.force_authenticate(self.admin)
        res = self.client.post(url, {'other': b['customer']}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['summary']['outstanding'], 200)
        self.assertEqual(Debt.objects.count(), 1)
        self.assertEqual(Sale.objects.filter(customer_id=a['customer']).count(), 2)
        self.assertFalse(Customer.objects.filter(pk=b['customer']).exists())

    def test_rename_updates_debts_and_blocks_duplicate_phone(self):
        a = self.sell(customer_name='Ivy', customer_phone='0700000002')
        self.sell(customer_name='Jo', customer_phone='0700000003')
        self.client.force_authenticate(self.admin)
        url = f'/api/customers/{a["customer"]}/'
        self.assertEqual(self.client.patch(url, {'name': 'Ivy K'}, format='json').status_code, 200)
        self.assertEqual(Debt.objects.get(customer_id=a['customer']).party_name, 'Ivy K')
        self.assertEqual(self.client.patch(url, {'phone': '0700000003'}, format='json').status_code, 400)

    def test_customer_with_sales_cannot_be_deleted(self):
        a = self.sell(customer_name='Kim')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'/api/customers/{a["customer"]}/').status_code, 400)

    def test_list_shows_balance_and_spend(self):
        self.sell(paid=40, customer_name='Nia')
        nia = self.client.get('/api/customers/?search=nia').data['customers'][0]
        self.assertEqual((nia['sale_count'], nia['total_spent'], nia['balance']), (1, 100, 60))



class CreditLimitTests(APITestCase):
    def setUp(self):
        from apps.inventory.models import Product
        self.admin = User.objects.create_user('boss', password='x', role='admin')
        self.cashier = User.objects.create_user('till', password='x', role='cashier')
        self.oil = Product.objects.create(name='Oil', sku='OIL-CL', cost_price=10,
                                          selling_price=100, quantity=100)
        self.ann = Customer.objects.create(name='Ann', phone='0772000111', credit_limit=500)
        self._n = 0

    def sell(self, price, paid=0, name='Ann', phone='0772000111', **extra):
        self._n += 1
        return self.client.post('/api/sales/', {
            'reference': f'CL-{self._n}', 'customer_name': name, 'customer_phone': phone,
            'amount_paid': paid, **extra,
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': price}],
        }, format='json')

    def test_credit_up_to_the_limit_is_allowed(self):
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.sell(300).status_code, 201)
        self.assertEqual(self.sell(200).status_code, 201)  # exactly 500 owed

    def test_sale_that_goes_over_the_limit_is_blocked(self):
        self.client.force_authenticate(self.cashier)
        self.sell(400)
        res = self.sell(300, paid=100)  # 200 more on credit -> 600
        self.assertEqual(res.status_code, 400)
        self.assertIn('at most 100 more', str(res.data['credit_limit']))
        self.assertEqual(self.oil.__class__.objects.get(pk=self.oil.pk).quantity, 99)  # no stock taken

    def test_paying_enough_now_lets_the_sale_through(self):
        self.client.force_authenticate(self.cashier)
        self.sell(400)
        self.assertEqual(self.sell(300, paid=200).status_code, 201)  # 100 more -> 500

    def test_cashier_cannot_override_but_admin_can(self):
        self.client.force_authenticate(self.cashier)
        self.sell(500)
        self.assertEqual(self.sell(100, override_credit_limit=True).status_code, 400)
        self.client.force_authenticate(self.admin)
        res = self.sell(100, override_credit_limit=True)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIn('Allowed over credit limit by boss', res.data['notes'])

    def test_no_limit_means_no_check_and_cash_sales_always_pass(self):
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.sell(5000, name='Bob', phone='0772999888').status_code, 201)
        self.sell(500)
        self.assertEqual(self.sell(300, paid=300).status_code, 201)

    def test_limit_is_shown_and_only_managers_can_set_it(self):
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.client.patch(f'/api/customers/{self.ann.id}/',
                                           {'credit_limit': 9999}, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        res = self.client.patch(f'/api/customers/{self.ann.id}/', {'credit_limit': 800}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        rows = self.client.get('/api/customers/').data['customers']
        self.assertEqual(rows[0]['credit_limit'], 800)
        self.assertEqual(self.client.get(f'/api/customers/{self.ann.id}/').data['credit_limit'], 800)


    def test_credit_check_finds_typed_customer_without_creating_one(self):
        self.client.force_authenticate(self.cashier)
        self.sell(300)
        res = self.client.get('/api/customers/credit-check/?name=ann&phone=').data
        self.assertEqual(res, {'found': True, 'id': self.ann.id, 'name': 'Ann',
                               'balance': 300, 'credit_limit': 500})
        res = self.client.get('/api/customers/credit-check/?name=Nobody&phone=0700000001').data
        self.assertEqual(res, {'found': False})
        self.assertEqual(Customer.objects.count(), 1)

    def test_manual_debt_respects_the_limit(self):
        self.client.force_authenticate(self.admin)
        self.sell(400)
        body = {'debt_type': 'receivable', 'party_name': 'Ann', 'party_phone': '0772000111',
                'amount': 200}
        res = self.client.post('/api/debts/', body, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('at most 100 more', str(res.data['credit_limit']))
        res = self.client.post('/api/debts/', {**body, 'override_credit_limit': True}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIn('Allowed over credit limit by boss', Debt.objects.get(pk=res.data['id']).charges.last().notes)
        # Within the limit, and payables, are never checked
        self.assertEqual(self.client.post('/api/debts/', {**body, 'party_name': 'Bob',
                                                          'party_phone': '0711111111'},
                                          format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/debts/', {**body, 'debt_type': 'payable',
                                                          'amount': 99999},
                                          format='json').status_code, 201)
