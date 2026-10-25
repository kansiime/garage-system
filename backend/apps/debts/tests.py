from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.debts.models import Debt, DebtCharge
from apps.inventory.models import Product
from apps.sales.models import Sale


class DebtFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='x', role='admin')
        self.cashier = User.objects.create_user('cash', password='x', role='cashier')
        self.oil = Product.objects.create(name='Oil', sku='OIL', cost_price=10,
                                          selling_price=100, quantity=50)
        self.client.force_authenticate(self.cashier)
        self._n = 0

    def sell(self, name='', phone='', paid=0, qty=1, price=100, expect=201):
        self._n += 1
        res = self.client.post('/api/sales/', {
            'reference': f'SL-{self._n}', 'customer_name': name,
            'customer_phone': phone, 'amount_paid': paid,
            'items': [{'product': self.oil.id, 'quantity': qty, 'unit_price': price}],
        }, format='json')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def pay(self, debt_id, amount, expect=200):
        res = self.client.post(f'/api/debts/{debt_id}/record_payment/',
                               {'amount': amount}, format='json')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    # --- running debt per customer -------------------------------------------
    def test_second_credit_for_same_name_is_added_to_existing_debt(self):
        self.sell('John Doe', paid=0, price=300)
        data = self.sell('  john   doe ', paid=0, price=200)
        self.assertTrue(data['debt_merged'])
        self.assertEqual(Debt.objects.count(), 1)
        debt = Debt.objects.get()
        self.assertEqual(debt.amount, Decimal('500'))
        self.assertEqual(debt.charges.count(), 2)

    def test_same_phone_merges_even_if_name_spelled_differently(self):
        self.sell('John', phone='0772123456', price=100)
        self.sell('Jon D', phone='+256 772 123456', price=100)
        self.assertEqual(Debt.objects.count(), 1)

    def test_same_name_different_phone_stays_separate(self):
        self.sell('John', phone='0772000001', price=100)
        self.sell('John', phone='0772000002', price=100)
        self.assertEqual(Debt.objects.count(), 2)

    def test_paid_off_debt_is_not_reopened(self):
        d = self.sell('Ann', price=100)
        self.pay(d['debt_id'], 100)
        self.sell('Ann', price=50)
        self.assertEqual(Debt.objects.exclude(status='paid').get().amount, Decimal('50'))

    def test_manual_debt_merges_into_open_debt(self):
        self.client.force_authenticate(self.admin)
        self.sell('Ann', price=100)
        res = self.client.post('/api/debts/', {
            'debt_type': 'receivable', 'party_name': 'ann', 'amount': 40,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['merged'])
        self.assertEqual(Debt.objects.get().amount, Decimal('140'))

    # --- partial sale → debt ------------------------------------------------
    def test_partial_payment_balance_is_recorded_as_debt(self):
        data = self.sell('Ben', paid=30, price=100)
        self.assertEqual(data['payment_type'], 'partial')
        debt = Debt.objects.get()
        self.assertEqual(debt.balance, Decimal('70'))
        self.assertEqual(debt.status, 'open')
        self.assertEqual(data['debt_balance'], 70)

    def test_cash_sale_creates_no_debt(self):
        data = self.sell('', paid=100, price=100)
        self.assertEqual(data['payment_type'], 'cash')
        self.assertFalse(Debt.objects.exists())

    # --- payments -----------------------------------------------------------
    def test_part_payment_is_deducted_oldest_sale_first(self):
        s1 = self.sell('Cy', price=100)
        s2 = self.sell('Cy', price=200)
        debt = self.pay(s1['debt_id'], 150)
        self.assertEqual(Decimal(debt['balance']), Decimal('150'))
        self.assertEqual(debt['status'], 'partial')
        self.assertEqual(Sale.objects.get(pk=s1['id']).balance, Decimal('0'))
        self.assertEqual(Sale.objects.get(pk=s2['id']).balance, Decimal('150'))

    def test_overpayment_and_zero_payment_rejected(self):
        s = self.sell('Di', price=100)
        self.pay(s['debt_id'], 101, expect=400)
        self.pay(s['debt_id'], 0, expect=400)
        self.pay(s['debt_id'], -5, expect=400)
        self.pay(s['debt_id'], 100)
        self.pay(s['debt_id'], 1, expect=400)   # already paid

    # --- sale loopholes -----------------------------------------------------
    def test_credit_without_customer_name_rejected(self):
        self.sell('', paid=0, expect=400)

    def test_paid_more_than_total_rejected(self):
        self.sell('Ed', paid=500, price=100, expect=400)

    def test_overselling_stock_rejected(self):
        self.sell('Ed', paid=5100, qty=51, expect=400)
        self.oil.refresh_from_db()
        self.assertEqual(self.oil.quantity, 50)

    def test_negative_quantity_or_price_rejected(self):
        self.sell('Ed', qty=-2, expect=400)
        self.sell('Ed', price=-100, paid=0, expect=400)

    def test_sales_cannot_be_edited_or_deleted_by_cashier(self):
        s = self.sell('Fay', paid=100)
        self.assertEqual(self.client.put(f'/api/sales/{s["id"]}/', {}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(f'/api/sales/{s["id"]}/').status_code, 403)

    def test_admin_can_backdate_sale_cashier_cannot(self):
        from datetime import timedelta
        from django.utils import timezone
        from apps.inventory.models import StockMovement

        yesterday = timezone.localdate() - timedelta(days=1)
        res = self.client.post('/api/sales/', {
            'reference': 'SL-OLD', 'customer_name': 'Hal', 'amount_paid': 0,
            'sale_date': yesterday.isoformat(),
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 400)

        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/sales/', {
            'reference': 'SL-OLD', 'customer_name': 'Hal', 'amount_paid': 0,
            'sale_date': yesterday.isoformat(),
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        sale = Sale.objects.get(reference='SL-OLD')
        self.assertEqual(timezone.localtime(sale.created_at).date(), yesterday)
        mv = StockMovement.objects.get(reference='SL-OLD')
        self.assertEqual(timezone.localtime(mv.created_at).date(), yesterday)
        charge = DebtCharge.objects.get(sale=sale)
        self.assertEqual(timezone.localtime(charge.created_at).date(), yesterday)

        tomorrow = timezone.localdate() + timedelta(days=1)
        res = self.client.post('/api/sales/', {
            'reference': 'SL-NEXT', 'amount_paid': 100, 'sale_date': tomorrow.isoformat(),
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_admin_void_restores_stock_and_debt(self):
        self.sell('Gus', price=100, qty=2)
        s2 = self.sell('Gus', price=100, qty=3)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'/api/sales/{s2["id"]}/').status_code, 204)
        self.oil.refresh_from_db()
        self.assertEqual(self.oil.quantity, 48)
        self.assertEqual(Debt.objects.get().amount, Decimal('200'))

    def test_void_blocked_after_payment(self):
        s = self.sell('Hal', price=100)
        self.pay(s['debt_id'], 10)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'/api/sales/{s["id"]}/').status_code, 400)

    # --- debt permissions & edits ------------------------------------------
    def test_cashier_cannot_edit_or_delete_debts(self):
        s = self.sell('Ivy', price=100)
        url = f'/api/debts/{s["debt_id"]}/'
        self.assertEqual(self.client.patch(url, {'amount': 1}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.assertEqual(self.client.post('/api/debts/', {
            'debt_type': 'receivable', 'party_name': 'X', 'amount': 5}, format='json').status_code, 403)

    def test_amount_cannot_drop_below_paid(self):
        self.client.force_authenticate(self.admin)
        s = self.sell('Jo', price=100)
        self.pay(s['debt_id'], 60)
        url = f'/api/debts/{s["debt_id"]}/'
        self.assertEqual(self.client.patch(url, {'amount': 50}, format='json').status_code, 400)
        res = self.client.patch(url, {'amount': 80}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        debt = Debt.objects.get()
        self.assertEqual(debt.balance, Decimal('20'))
        self.assertEqual(sum(c.amount for c in debt.charges.all()), debt.amount)

    def test_sale_debt_cannot_be_deleted(self):
        self.client.force_authenticate(self.admin)
        s = self.sell('Kim', price=100)
        self.assertEqual(self.client.delete(f'/api/debts/{s["debt_id"]}/').status_code, 400)

    # --- follow-ups ---------------------------------------------------------
    def test_cashier_can_log_follow_up_and_it_sets_promised_date(self):
        s = self.sell('Lee', phone='0772111222', price=100)
        promised = timezone.localdate() + timedelta(days=3)
        res = self.client.post(f'/api/debts/{s["debt_id"]}/add_follow_up/', {
            'method': 'call', 'note': 'Said he will pay on Friday',
            'promised_date': promised.isoformat(),
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['promised_date'], promised.isoformat())
        entry = res.data['follow_ups'][0]
        self.assertEqual(entry['note'], 'Said he will pay on Friday')
        self.assertEqual(entry['contacted_on'], timezone.localdate().isoformat())
        self.assertEqual(entry['recorded_by'], 'cash')

    def test_follow_up_needs_note_and_no_future_date(self):
        s = self.sell('Mo', price=100)
        url = f'/api/debts/{s["debt_id"]}/add_follow_up/'
        self.assertEqual(self.client.post(url, {'note': '   '}, format='json').status_code, 400)
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        self.assertEqual(self.client.post(url, {
            'note': 'x', 'contacted_on': tomorrow}, format='json').status_code, 400)

    # --- returns ------------------------------------------------------------
    def test_credit_return_reduces_that_sales_debt(self):
        s = self.sell('Lu', price=100, qty=2)
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/returns/', {
            'reference': 'RT-1', 'return_type': 'sales', 'resolution': 'credit',
            'original_reference': s['reference'],
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Debt.objects.get().balance, Decimal('100'))

    def test_cannot_return_more_than_sold(self):
        s = self.sell('Mo', paid=100, price=100, qty=1)
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/returns/', {
            'reference': 'RT-2', 'return_type': 'sales', 'resolution': 'refund',
            'original_reference': s['reference'],
            'items': [{'product': self.oil.id, 'quantity': 5, 'unit_price': 100}],
        }, format='json')
        self.assertEqual(res.status_code, 400)

    # --- reports ------------------------------------------------------------
    def test_customer_balance_not_double_counted(self):
        self.sell('Nia', phone='0772555555', paid=40, price=100)
        res = self.client.get('/api/reports/customers/')
        nia = [c for c in res.data['customers'] if c['name'] == 'Nia'][0]
        self.assertEqual(nia['balance'], 60)

    def test_invariant_charges_match_debt(self):
        a = self.sell('Oz', price=100)
        self.sell('Oz', price=250, paid=50)
        self.pay(a['debt_id'], 120)
        d = Debt.objects.get()
        self.assertEqual(sum(c.amount for c in d.charges.all()), d.amount)
        self.assertEqual(sum(c.amount_paid for c in d.charges.all()), d.amount_paid)
        self.assertEqual(DebtCharge.objects.count(), 2)
