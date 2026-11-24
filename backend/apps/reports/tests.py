from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.inventory.models import Product, Supplier
from apps.sales.models import Sale


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
        self.assertEqual(data['selected']['purchases'], 300)
        self.assertEqual(data['payables'], 300)
        overview = self.client.get('/api/reports/overview/?period=today').data
        self.assertEqual(overview['kpis']['total_purchases'], 300)

    def test_trend_covers_seven_days_with_today_last(self):
        self.client.post('/api/sales/', {
            'reference': 'SL-1', 'amount_paid': 200,
            'items': [{'product': self.oil.id, 'quantity': 2, 'unit_price': 100}],
        }, format='json')
        trend = self.client.get('/api/reports/dashboard/?period=week').data['selected']['trend']['points']
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
        sel = data['selected']
        self.assertEqual(sel['sales']['total'], 300)
        self.assertEqual(sel['debt_payments'], {'total': 120, 'count': 1})
        month = self.client.get('/api/reports/dashboard/?period=month').data['selected']
        self.assertEqual(month['debt_payments']['total'], 120)
        self.assertEqual(sel['trend']['points'][-1]['debt_payments'], 120)
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
        self.assertEqual(daily[3], {'date': str(today), 'sales': 100, 'paid_at_sale': 100,
                                    'debt_payments': 75, 'debt_payments_count': 1,
                                    'expenses': 0, 'net_cash': 175})

    def test_profit_is_split_into_collected_and_still_in_debts(self):
        # Two sales, each 100 profit: one paid in full, one on credit,
        # then the customer pays half of the credit sale.
        self.client.post('/api/sales/', {
            'reference': 'SL-1', 'amount_paid': 250,
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 250}],
        }, format='json')
        credit = self.client.post('/api/sales/', {
            'reference': 'SL-2', 'customer_name': 'Ann', 'amount_paid': 0,
            'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 160}],
        }, format='json').data
        self.client.post(f'/api/debts/{credit["debt_id"]}/record_payment/',
                         {'amount': 80}, format='json')

        month = self.client.get('/api/reports/dashboard/?period=month').data['selected']['collection']
        self.assertEqual(month['sales'], 410)
        self.assertEqual(month['collected'], 330)
        self.assertEqual(month['still_owed'], 80)
        self.assertEqual(month['profit'], 290)  # 190 + 100
        self.assertEqual(month['profit_in_debts'], 50)  # half of 100
        self.assertEqual(month['profit_collected'], 240)
        kpis = self.client.get('/api/reports/overview/?period=today').data['kpis']
        self.assertEqual(kpis['profit_in_debts'], 50)
        self.assertEqual(kpis['net_profit_received'], 240)

    def test_downloads_include_debts_paid_and_profit_received(self):
        credit = self.client.post('/api/sales/', {
            'reference': 'SL-1', 'customer_name': 'Ann', 'amount_paid': 0,
            'items': [{'product': self.oil.id, 'quantity': 3, 'unit_price': 100}],
        }, format='json').data
        self.client.post(f'/api/debts/{credit["debt_id"]}/record_payment/',
                         {'amount': 100}, format='json')

        money_in = self.client.get('/api/reports/money-in/?period=week&output=json').data
        self.assertEqual(len(money_in['rows']), 7)
        self.assertEqual(money_in['rows'][0], [str(timezone.localdate()), 300, 0, 100, 0, 100])
        self.assertEqual(money_in['summary']['Debts Paid'], 100)

        profit = self.client.get('/api/reports/profit/?period=today&output=json').data['summary']
        self.assertEqual(profit['Profit Received'], 40)       # 1/3 of 120 profit
        self.assertEqual(profit['Profit Still in Debts'], 80)
        sales = self.client.get('/api/reports/sales/?period=today&output=json').data['summary']
        self.assertEqual(sales['Sales Still Owed'], 200)
        self.assertEqual(sales['Debt Payments Received'], 100)

        for key in ('money-in', 'profit', 'sales'):
            for fmt in ('pdf', 'excel'):
                res = self.client.get(f'/api/reports/{key}/?period=month&output={fmt}')
                self.assertEqual(res.status_code, 200, (key, fmt))
                self.assertGreater(len(res.content), 500)

    def test_dashboard_figures_follow_the_chosen_period(self):
        from datetime import timedelta
        from apps.debts.models import Debt, DebtPayment
        today = timezone.localdate()
        credit = self.client.post('/api/sales/', {
            'reference': 'SL-1', 'customer_name': 'Ann', 'amount_paid': 0,
            'items': [{'product': self.oil.id, 'quantity': 2, 'unit_price': 100}],
        }, format='json').data
        old = Sale.objects.get(reference='SL-1')
        Sale.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=40))
        self.client.post(f'/api/debts/{credit["debt_id"]}/record_payment/', {'amount': 50}, format='json')

        sel = self.client.get('/api/reports/dashboard/').data['selected']  # default: today
        self.assertEqual(sel['start'], str(today))
        self.assertEqual(sel['sales']['total'], 0)
        self.assertEqual(sel['debt_payments']['total'], 50)

        start = today - timedelta(days=45)
        sel = self.client.get(
            f'/api/reports/dashboard/?period=custom&start={start}&end={today}').data['selected']
        self.assertEqual(sel['sales']['total'], 200)
        self.assertEqual(sel['sales']['profit'], 80)
        self.assertEqual(sel['collection']['profit_in_debts'], 60)  # 150 of 200 unpaid
        self.assertEqual(sel['trend']['unit'], 'day')
        self.assertEqual(len(sel['trend']['points']), 46)
        self.assertEqual(sum(p['total'] for p in sel['trend']['points']), 200)

        year = self.client.get('/api/reports/dashboard/?period=year').data['selected']['trend']
        self.assertEqual(year['unit'], 'month' if (today - today.replace(month=1, day=1)).days > 62 else 'day')

        last = self.client.get('/api/reports/dashboard/?period=last_month').data['selected']
        self.assertTrue(last['end'] < str(today.replace(day=1)))

    def test_report_queries_dont_grow_with_the_number_of_sales(self):
        """Each extra database round trip costs real time on the hosted
        database, so these pages must not query once per sale or item."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        other = Product.objects.create(name='Filter', sku='FLT', cost_price=5,
                                       selling_price=20, quantity=500)
        urls = ['/api/reports/overview/?period=month', '/api/reports/dashboard/?period=month',
                '/api/reports/profit/?period=month&output=json',
                '/api/reports/product-movement/?period=month',
                '/api/reports/expenses/?period=month&output=json',
                '/api/reports/purchases/?period=month&output=json',
                '/api/reports/stock/?output=json']

        def counts():
            out = {}
            for url in urls:
                with CaptureQueriesContext(connection) as q:
                    self.assertEqual(self.client.get(url).status_code, 200, url)
                out[url] = len(q.captured_queries)
            return out

        def sell(n):
            res = self.client.post('/api/sales/', {
                'reference': f'QC-{n}', 'customer_name': f'Cust {n}', 'amount_paid': 10,
                'items': [{'product': self.oil.id, 'quantity': 1, 'unit_price': 100},
                          {'product': other.id, 'quantity': 1, 'unit_price': 20}],
            }, format='json')
            self.assertEqual(res.status_code, 201, res.data)

        sell(0)
        counts()  # warm up: the first call loads settings that are then cached
        few = counts()
        for n in range(1, 9):
            sell(n)
        self.assertEqual(counts(), few)

    def test_net_cash_is_paid_at_sale_plus_debts_paid_minus_expenses_paid(self):
        from datetime import timedelta
        from apps.expenses.models import Expense
        today = timezone.localdate()
        # 250 paid at the counter on a 400 sale; 150 goes on Ann's debt
        sale = self.client.post('/api/sales/', {
            'reference': 'SL-1', 'customer_name': 'Ann', 'amount_paid': 250,
            'items': [{'product': self.oil.id, 'quantity': 4, 'unit_price': 100}],
        }, format='json').data
        self.client.post(f'/api/debts/{sale["debt_id"]}/record_payment/', {'amount': 100}, format='json')
        Expense.objects.create(description='Fuel', amount=70, expense_date=today, payment_method='cash')
        Expense.objects.create(description='Parts on account', amount=500, expense_date=today,
                               payment_method='credit')  # not paid yet: no money out
        Expense.objects.create(description='Rent', amount=999, expense_date=today - timedelta(days=40))

        cash = self.client.get('/api/reports/dashboard/').data['selected']['cash']
        self.assertEqual(cash, {'paid_at_sale': 250, 'debts_paid': 100, 'money_in': 350,
                                'expenses_paid': 70, 'net_cash': 280})
        self.assertEqual(self.client.get('/api/reports/overview/?period=today')
                         .data['kpis']['cash']['net_cash'], 280)
        day = self.client.get('/api/reports/overview/?period=today').data['daily_money_in'][-1]
        self.assertEqual((day['paid_at_sale'], day['expenses'], day['net_cash']), (250, 70, 280))
        row = self.client.get('/api/reports/money-in/?period=today&output=json').data['rows'][0]
        self.assertEqual(row, [str(today), 400, 250, 100, 70, 280])


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

        dash = self.client.get('/api/reports/dashboard/?period=month').data['selected']
        self.assertEqual(dash['returns_profit_lost'], 40)
        self.assertEqual(dash['net_profit'], 80 - 40)
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
        self.assertEqual(self.client.get('/api/reports/dashboard/?period=month')
                         .data['selected']['net_profit'], 0)
