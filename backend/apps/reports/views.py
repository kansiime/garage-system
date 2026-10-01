from decimal import Decimal
from datetime import timedelta, datetime

from django.db.models import Sum, Count, F
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.sales.models import Sale, SaleItem
from apps.purchases.models import Purchase
from apps.debts.models import Debt
from apps.inventory.models import Product
from apps.accounts.models import GarageSettings

from .pdf_generator import generate_report_pdf
from .excel_generator import generate_report_excel


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _local_today():
    """Return today's date in the local (Kampala) timezone."""
    return timezone.localtime().date()


def _range_from_params(request):
    period = request.query_params.get('period', 'today')
    today = _local_today()

    if period == 'today':
        start = end = today
    elif period == 'week':
        start = today - timedelta(days=6)   # inclusive: last 7 days including today
        end = today
    elif period == 'month':
        start = today.replace(day=1)
        end = today
    elif period == 'year':
        start = today.replace(month=1, day=1)
        end = today
    elif period == 'custom':
        start = datetime.strptime(request.query_params.get('start'), '%Y-%m-%d').date()
        end = datetime.strptime(request.query_params.get('end'), '%Y-%m-%d').date()
    else:
        start = end = today
    return start, end


def _shop_meta():
    shop = GarageSettings.load()
    return {
        'Business': shop.name,
        'Currency': shop.currency_symbol or shop.currency_code or 'UGX',
    }


def _filter_by_local_date(qs, start, end, field='created_at'):
    """Filter a queryset by LOCAL date range (uses the active timezone)."""
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start, datetime.min.time()), tz)
    end_dt = timezone.make_aware(
        datetime.combine(end + timedelta(days=1), datetime.min.time()), tz
    )
    return qs.filter(**{f'{field}__gte': start_dt, f'{field}__lt': end_dt})


# ---------------------------------------------------------------------------
# Dashboard summary
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    today = _local_today()
    month_start = today.replace(day=1)

    def aggregate_sales(start, end):
        sales = _filter_by_local_date(Sale.objects.all(), start, end)
        total = sales.aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
        items = SaleItem.objects.filter(sale__in=sales)
        profit = sum(
            (i.quantity * (i.unit_price - i.cost_price) for i in items),
            Decimal('0'),
        )
        return {
            'total': float(total),
            'profit': float(profit),
            'count': sales.count(),
        }

    purchases_today = _filter_by_local_date(Purchase.objects.all(), today, today)
    purchases_month = _filter_by_local_date(Purchase.objects.all(), month_start, today)

    receivables = Debt.objects.filter(debt_type='receivable').exclude(status='paid')
    payables = Debt.objects.filter(debt_type='payable').exclude(status='paid')

    low_qs = Product.objects.filter(quantity__lte=F('reorder_level'))
    low_stock_items = list(
        low_qs.values('id', 'name', 'sku', 'quantity', 'reorder_level')[:10]
    )

    shop = GarageSettings.load()

    return Response({
        'today': aggregate_sales(today, today),
        'month': aggregate_sales(month_start, today),
        'purchases_today': float(
            purchases_today.aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
        ),
        'purchases_month': float(
            purchases_month.aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
        ),
        'receivables': float(sum((d.balance for d in receivables), Decimal('0'))),
        'payables': float(sum((d.balance for d in payables), Decimal('0'))),
        'stock_value': float(
            sum((p.stock_value for p in Product.objects.all()), Decimal('0'))
        ),
        'low_stock': low_qs.count(),
        'low_stock_items': low_stock_items,
        'currency': shop.currency_symbol or shop.currency_code or 'UGX',
        'business_name': shop.name,
    })


# ---------------------------------------------------------------------------
# Rich reports overview (used by the Reports page)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reports_overview(request):
    start, end = _range_from_params(request)
    shop = GarageSettings.load()
    currency = shop.currency_symbol or shop.currency_code or 'UGX'

    sales_qs = _filter_by_local_date(Sale.objects.all(), start, end)
    items_qs = SaleItem.objects.filter(sale__in=sales_qs)
    purchases_qs = _filter_by_local_date(Purchase.objects.all(), start, end)
    debts_qs = _filter_by_local_date(Debt.objects.all(), start, end)

    # --- KPIs (all math done in Decimal, then cast to float at the end) ---
    total_sales = sales_qs.aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
    total_purchases = purchases_qs.aggregate(t=Sum('total_amount'))['t'] or Decimal('0')

    revenue_dec = sum((i.quantity * i.unit_price for i in items_qs), Decimal('0'))
    cost_dec = sum((i.quantity * i.cost_price for i in items_qs), Decimal('0'))
    profit_dec = revenue_dec - cost_dec

    total_sales_f = float(total_sales)
    total_purchases_f = float(total_purchases)
    revenue_f = float(revenue_dec)
    cost_f = float(cost_dec)
    total_profit_f = float(profit_dec)

    count = sales_qs.count()
    gross_margin = round((total_profit_f / revenue_f * 100) if revenue_f else 0, 1)
    average_sale = round(total_sales_f / count, 0) if count else 0

    # --- Sales trend (per day) ---
    trend = (
        sales_qs.annotate(day=TruncDate('created_at', tzinfo=timezone.get_current_timezone()))
        .values('day')
        .annotate(total=Sum('total_amount'), count=Count('id'))
        .order_by('day')
    )
    sales_trend = [
        {
            'date': t['day'].strftime('%Y-%m-%d'),
            'total': float(t['total'] or Decimal('0')),
            'count': t['count'],
        }
        for t in trend
    ]

    # --- Top products by revenue ---
    product_map = {}
    for i in items_qs:
        key = i.product.name
        if key not in product_map:
            product_map[key] = {
                'name': key, 'qty': 0,
                'revenue': Decimal('0'), 'cost': Decimal('0'),
            }
        product_map[key]['qty'] += i.quantity
        product_map[key]['revenue'] += i.quantity * i.unit_price
        product_map[key]['cost'] += i.quantity * i.cost_price

    top_products = sorted(
        product_map.values(), key=lambda x: x['revenue'], reverse=True
    )[:10]
    top_products = [
        {
            'name': p['name'],
            'qty': p['qty'],
            'revenue': float(p['revenue']),
            'cost': float(p['cost']),
            'profit': float(p['revenue'] - p['cost']),
        }
        for p in top_products
    ]

    # --- Payment mix ---
    payment_mix_raw = (
        sales_qs.values('payment_type')
        .annotate(count=Count('id'), total=Sum('total_amount'))
        .order_by('-total')
    )
    payment_mix = [
        {
            'type': p['payment_type'],
            'count': p['count'],
            'total': float(p['total'] or Decimal('0')),
        }
        for p in payment_mix_raw
    ]

    # --- Cash vs Credit KPI ---
    def _sum_by_type(t):
        r = sales_qs.filter(payment_type=t).aggregate(
            total=Sum('total_amount'), count=Count('id')
        )
        return {
            'total': float(r['total'] or Decimal('0')),
            'count': r['count'] or 0,
        }
    cash_stats = _sum_by_type('cash')
    credit_stats = _sum_by_type('credit')
    partial_stats = _sum_by_type('partial')

    # --- Top customers ---
    customer_map = {}
    for s in sales_qs:
        name = (s.customer_name or '').strip() or 'Walk-in'
        if name not in customer_map:
            customer_map[name] = {
                'name': name,
                'phone': s.customer_phone or '',
                'count': 0,
                'total': Decimal('0'),
                'balance': Decimal('0'),
                'last_visit': s.created_at,
            }
        customer_map[name]['count'] += 1
        customer_map[name]['total'] += s.total_amount
        customer_map[name]['balance'] += s.balance
        if s.created_at > customer_map[name]['last_visit']:
            customer_map[name]['last_visit'] = s.created_at
            if s.customer_phone:
                customer_map[name]['phone'] = s.customer_phone

    top_customers = sorted(
        customer_map.values(), key=lambda x: x['total'], reverse=True
    )[:10]
    top_customers = [
        {
            'name': c['name'],
            'phone': c['phone'],
            'count': c['count'],
            'total': float(c['total']),
            'balance': float(c['balance']),
            'last_visit': timezone.localtime(c['last_visit']).strftime('%Y-%m-%d'),
        }
        for c in top_customers
    ]

    # --- Stock value by category ---
    categories = {}
    for p in Product.objects.select_related('category'):
        cat = p.category.name if p.category else 'Uncategorised'
        if cat not in categories:
            categories[cat] = {
                'category': cat, 'value': Decimal('0'),
                'products': 0, 'qty': 0,
            }
        categories[cat]['value'] += p.stock_value
        categories[cat]['qty'] += p.quantity
        categories[cat]['products'] += 1
    stock_by_category = [
        {
            'category': c['category'],
            'value': float(c['value']),
            'qty': c['qty'],
            'products': c['products'],
        }
        for c in categories.values()
    ]

    # --- Debt summary ---
    total_receivable = float(
        sum((d.balance for d in debts_qs if d.debt_type == 'receivable'), Decimal('0'))
    )
    total_payable = float(
        sum((d.balance for d in debts_qs if d.debt_type == 'payable'), Decimal('0'))
    )

    return Response({
        'business_name': shop.name,
        'currency': currency,
        'period': {'start': str(start), 'end': str(end)},
        'kpis': {
            'total_sales': total_sales_f,
            'total_purchases': total_purchases_f,
            'total_profit': total_profit_f,
            'gross_margin': gross_margin,
            'transaction_count': count,
            'average_sale': average_sale,
            'receivables': total_receivable,
            'payables': total_payable,
            'stock_value': float(
                sum((p.stock_value for p in Product.objects.all()), Decimal('0'))
            ),
        },
        'cash_vs_credit': {
            'cash': cash_stats,
            'credit': credit_stats,
            'partial': partial_stats,
        },
        'sales_trend': sales_trend,
        'top_products': top_products,
        'top_customers': top_customers,
        'payment_mix': payment_mix,
        'stock_by_category': stock_by_category,
    })


# ---------------------------------------------------------------------------
# Detailed reports (PDF / Excel / JSON)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sales_report(request):
    start, end = _range_from_params(request)
    sales = _filter_by_local_date(Sale.objects.all(), start, end).order_by('-created_at')
    headers = ['Reference', 'Date', 'Customer', 'Payment', 'Total', 'Paid', 'Balance']
    rows = [
        [
            s.reference,
            timezone.localtime(s.created_at).strftime('%Y-%m-%d %H:%M'),
            s.customer_name or '-',
            s.payment_type,
            float(s.total_amount),
            float(s.amount_paid),
            float(s.balance),
        ]
        for s in sales
    ]
    total = float(sales.aggregate(t=Sum('total_amount'))['t'] or Decimal('0'))
    summary = {**_shop_meta(), 'Total Sales': total, 'Transactions': sales.count()}
    return _respond(request, f"Sales Report ({start} to {end})", headers, rows, summary)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def purchases_report(request):
    start, end = _range_from_params(request)
    purchases = _filter_by_local_date(
        Purchase.objects.all(), start, end
    ).order_by('-created_at')
    headers = ['Reference', 'Date', 'Supplier', 'Status', 'Total', 'Paid', 'Balance']
    rows = [
        [
            p.reference,
            timezone.localtime(p.created_at).strftime('%Y-%m-%d %H:%M'),
            p.supplier.name if p.supplier else '-',
            p.status,
            float(p.total_amount),
            float(p.amount_paid),
            float(p.balance),
        ]
        for p in purchases
    ]
    summary = {
        **_shop_meta(),
        'Total Purchases': float(
            purchases.aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
        ),
        'Count': purchases.count(),
    }
    return _respond(request, f"Purchases Report ({start} to {end})", headers, rows, summary)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stock_report(request):
    products = Product.objects.all().order_by('name')
    headers = ['SKU', 'Name', 'Category', 'Qty', 'Cost Price', 'Selling Price', 'Stock Value']
    rows = [
        [
            p.sku,
            p.name,
            p.category.name if p.category else '-',
            p.quantity,
            float(p.cost_price),
            float(p.selling_price),
            float(p.stock_value),
        ]
        for p in products
    ]
    summary = {
        **_shop_meta(),
        'Total Products': products.count(),
        'Total Stock Value': float(
            sum((p.stock_value for p in products), Decimal('0'))
        ),
    }
    return _respond(request, "Stock Report", headers, rows, summary)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def debts_report(request):
    start, end = _range_from_params(request)
    debts = _filter_by_local_date(Debt.objects.all(), start, end)
    headers = ['Date', 'Type', 'Party', 'Amount', 'Paid', 'Balance', 'Status']
    rows = [
        [
            timezone.localtime(d.created_at).strftime('%Y-%m-%d'),
            d.get_debt_type_display(),
            d.party_name,
            float(d.amount),
            float(d.amount_paid),
            float(d.balance),
            d.status,
        ]
        for d in debts
    ]
    summary = {
        **_shop_meta(),
        'Total Receivables': float(
            sum((d.balance for d in debts if d.debt_type == 'receivable'), Decimal('0'))
        ),
        'Total Payables': float(
            sum((d.balance for d in debts if d.debt_type == 'payable'), Decimal('0'))
        ),
    }
    return _respond(request, f"Debts Report ({start} to {end})", headers, rows, summary)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profit_report(request):
    start, end = _range_from_params(request)
    sales = _filter_by_local_date(Sale.objects.all(), start, end)
    items = SaleItem.objects.filter(sale__in=sales)

    revenue_dec = sum((i.quantity * i.unit_price for i in items), Decimal('0'))
    cost_dec = sum((i.quantity * i.cost_price for i in items), Decimal('0'))
    profit_dec = revenue_dec - cost_dec

    headers = ['Product', 'Qty Sold', 'Revenue', 'Cost', 'Profit']
    rows = []
    product_map = {}
    for i in items:
        pname = i.product.name
        if pname not in product_map:
            product_map[pname] = {'qty': 0, 'rev': Decimal('0'), 'cost': Decimal('0')}
        product_map[pname]['qty'] += i.quantity
        product_map[pname]['rev'] += i.quantity * i.unit_price
        product_map[pname]['cost'] += i.quantity * i.cost_price

    for name, v in product_map.items():
        rows.append([
            name,
            v['qty'],
            float(v['rev']),
            float(v['cost']),
            float(v['rev'] - v['cost']),
        ])

    summary = {
        **_shop_meta(),
        'Revenue': float(revenue_dec),
        'Cost': float(cost_dec),
        'Gross Profit': float(profit_dec),
    }
    return _respond(request, f"Profit Report ({start} to {end})", headers, rows, summary)


# ---------------------------------------------------------------------------
# Format dispatcher
# ---------------------------------------------------------------------------
def _respond(request, title, headers, rows, summary):
    fmt = request.query_params.get('format', 'json')
    if fmt == 'pdf':
        buf = generate_report_pdf(title, headers, rows, summary)
        resp = HttpResponse(buf.getvalue(), content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="{title.replace(" ", "_")}.pdf"'
        return resp
    elif fmt == 'excel':
        buf = generate_report_excel(title, headers, rows, summary)
        resp = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = f'attachment; filename="{title.replace(" ", "_")}.xlsx"'
        return resp
    return Response({'title': title, 'headers': headers, 'rows': rows, 'summary': summary})