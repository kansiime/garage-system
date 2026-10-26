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
