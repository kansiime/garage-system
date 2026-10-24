from decimal import Decimal

from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.debts import services
from apps.debts.models import Debt
from apps.inventory.models import Product, Supplier
from apps.purchases.models import Purchase


class PurchaseDetailActionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='x', role='admin')
        self.store = User.objects.create_user('store', password='x', role='storekeeper')
        self.supplier = Supplier.objects.create(name='Papa Spares')
        self.oil = Product.objects.create(name='Oil', sku='OIL', cost_price=10,
                                          selling_price=100, quantity=5)
        self.client.force_authenticate(self.admin)
        self._n = 0

    def buy(self, status='pending', paid=0, qty=10, cost=100):
        self._n += 1
        res = self.client.post('/api/purchases/', {
            'reference': f'PO-{self._n}', 'supplier': self.supplier.id,
            'status': status, 'amount_paid': paid,
            'items': [{'product': self.oil.id, 'quantity': qty, 'unit_cost': cost}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def pay(self, pid, amount, expect=200):
        res = self.client.post(f'/api/purchases/{pid}/pay/', {'amount': amount}, format='json')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def test_pay_reduces_purchase_and_supplier_debt(self):
        p = self.buy(paid=200)
        data = self.pay(p['id'], 300)
        self.assertEqual(Decimal(data['balance']), Decimal('500'))
        debt = Debt.objects.get()
        self.assertEqual(debt.balance, Decimal('500'))
        self.assertEqual(debt.payments.count(), 1)

    def test_payment_goes_to_this_purchase_not_oldest(self):
        older = self.buy(cost=50)
        newer = self.buy(cost=100)
        self.pay(newer['id'], 1000)
        self.assertEqual(Purchase.objects.get(pk=newer['id']).balance, Decimal('0'))
        self.assertEqual(Purchase.objects.get(pk=older['id']).balance, Decimal('500'))
        self.assertEqual(Debt.objects.get().balance, Decimal('500'))

    def test_cannot_overpay_or_pay_paid_purchase(self):
        p = self.buy()
        self.pay(p['id'], 1001, expect=400)
        paid = self.buy(paid=1000)
        self.pay(paid['id'], 1, expect=400)

    def test_storekeeper_cannot_pay_or_cancel_but_can_receive(self):
        p = self.buy()
        self.client.force_authenticate(self.store)
        self.pay(p['id'], 100, expect=403)
        res = self.client.patch(f'/api/purchases/{p["id"]}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(res.status_code, 403)
        res = self.client.patch(f'/api/purchases/{p["id"]}/', {'status': 'received'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.oil.refresh_from_db()
        self.assertEqual(self.oil.quantity, 15)

    def test_cancel_writes_off_unpaid_supplier_debt(self):
        keep = self.buy(cost=50)            # 500 owed, stays
        p = self.buy(paid=300)              # 700 owed, cancelled
        res = self.client.patch(f'/api/purchases/{p["id"]}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        debt = Debt.objects.get()
        self.assertEqual(debt.amount, Decimal('500'))
        self.assertEqual(debt.balance, Decimal('500'))
        self.assertEqual(debt.amount, sum(c.amount for c in debt.charges.all()))
        # A later payment must not land on the cancelled purchase
        self.client.post(f'/api/debts/{debt.id}/record_payment/', {'amount': 500}, format='json')
        self.assertEqual(Purchase.objects.get(pk=keep['id']).balance, Decimal('0'))
        self.assertEqual(Purchase.objects.get(pk=p['id']).amount_paid, Decimal('300'))
        self.pay(p['id'], 1, expect=400)
        self.oil.refresh_from_db()
        self.assertEqual(self.oil.quantity, 5)

    def test_unpaid_purchase_from_supplier_with_long_phone(self):
        self.supplier.phone = '0772 123 456 / 0701 987 654'
        self.supplier.save()
        self.buy()
        self.assertEqual(Debt.objects.get().party_phone, '0772 123 456 / 0701 987 654')

    def test_received_purchase_cannot_be_cancelled(self):
        p = self.buy(status='received')
        res = self.client.patch(f'/api/purchases/{p["id"]}/', {'status': 'cancelled'}, format='json')
        self.assertEqual(res.status_code, 400)


class LinkPurchaseDebtsCommandTests(APITestCase):
    def setUp(self):
        self.papa = Supplier.objects.create(name='Papa Spares')
        self.aba = Supplier.objects.create(name='ABA')

    def legacy(self, ref, supplier, total, paid=0):
        # How purchases looked before they booked a supplier debt
        return Purchase.objects.create(reference=ref, supplier=supplier, status='received',
                                       total_amount=total, amount_paid=paid)

    def run_cmd(self, *args):
        from io import StringIO
        from django.core.management import call_command
        out = StringIO()
        call_command('link_purchase_debts', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing_and_apply_links(self):
        p = self.legacy('PO-1', self.papa, Decimal('1000'), Decimal('200'))
        self.assertIn('LINK  PO-1', self.run_cmd())
        self.assertEqual(Debt.objects.count(), 0)
        self.run_cmd('--apply')
        debt = Debt.objects.get()
        self.assertEqual(debt.balance, Decimal('800'))
        self.assertEqual(debt.charges.get().purchase, p)
        self.assertIn('already has', self.run_cmd('--apply'))
        self.assertEqual(Debt.objects.get().balance, Decimal('800'))

    def test_supplier_with_hand_entered_debt_is_skipped(self):
        services.add_charge(debt_type='payable', party_name='ABA', amount=500)
        self.legacy('PO-2', self.aba, Decimal('500'))
        self.legacy('PO-3', self.papa, Decimal('300'))
        out = self.run_cmd('--apply')
        self.assertIn('SKIP  PO-2', out)
        self.assertEqual(Debt.objects.get(party_name='ABA').balance, Decimal('500'))
        self.assertEqual(Debt.objects.get(party_name='Papa Spares').balance, Decimal('300'))
