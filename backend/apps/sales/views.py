from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from django.utils import timezone
from io import BytesIO
from reportlab.lib.pagesizes import A5
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

from .models import Sale
from .serializers import SaleSerializer
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.models import GarageSettings
from apps.accounts.audit import log
from apps.debts.models import Debt


class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.all().order_by('-id')
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'cashier']

    def perform_create(self, serializer):
        sale = serializer.save(user=self.request.user)
        log(self.request, 'create', 'Sale', sale.id,
            f'Sale {sale.reference} — {sale.total_amount}')

        # Auto-create a receivable debt if there's an outstanding balance
        if sale.balance and sale.balance > 0:
            Debt.objects.create(
                debt_type='receivable',
                party_name=(sale.customer_name or '').strip() or f'Customer ({sale.reference})',
                party_phone=sale.customer_phone or '',
                amount=sale.total_amount,
                amount_paid=sale.amount_paid,
                reference=sale.reference,
                notes=f'Auto-created from sale {sale.reference}',
                user=self.request.user,
                status=(
                    'paid' if sale.amount_paid >= sale.total_amount
                    else 'partial' if sale.amount_paid > 0
                    else 'open'
                ),
            )

    @action(detail=True, methods=['get'], url_path='receipt')
    def receipt(self, request, pk=None):
        sale = self.get_object()
        shop = GarageSettings.load()

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A5,
            leftMargin=10 * mm, rightMargin=10 * mm,
            topMargin=10 * mm, bottomMargin=10 * mm,
        )
        styles = getSampleStyleSheet()
        elements = []

        center = ParagraphStyle('center', parent=styles['Normal'], alignment=1)
        bold_center = ParagraphStyle('bc', parent=styles['Normal'], alignment=1,
                                     fontSize=14, leading=16, fontName='Helvetica-Bold')
        small_center = ParagraphStyle('sc', parent=styles['Normal'], alignment=1,
                                      fontSize=8, textColor=colors.grey)

        elements.append(Paragraph(shop.name, bold_center))
        if shop.address:
            elements.append(Paragraph(shop.address, center))
        contact = []
        if shop.phone: contact.append(f"Tel: {shop.phone}")
        if shop.email: contact.append(shop.email)
        if contact:
            elements.append(Paragraph(" | ".join(contact), small_center))
        if shop.tin:
            elements.append(Paragraph(f"TIN: {shop.tin}", small_center))
        elements.append(Spacer(1, 4 * mm))

        meta = [
            ['Receipt #:', sale.reference],
            ['Date:', timezone.localtime(sale.created_at).strftime('%Y-%m-%d %H:%M')],
            ['Customer:', sale.customer_name or 'Walk-in'],
            ['Served by:', sale.user.username if sale.user else '-'],
        ]
        if sale.customer_phone:
            meta.insert(3, ['Phone:', sale.customer_phone])
        meta_tbl = Table(meta, colWidths=[28 * mm, None])
        meta_tbl.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.grey),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(meta_tbl)
        elements.append(Spacer(1, 4 * mm))

        data = [['Item', 'Qty', 'Price', 'Amount']]
        for it in sale.items.all():
            data.append([
                it.product.name, str(it.quantity),
                f"{it.unit_price:,.0f}",
                f"{it.quantity * it.unit_price:,.0f}",
            ])
        items_tbl = Table(data, colWidths=[None, 15 * mm, 25 * mm, 30 * mm])
        items_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(items_tbl)
        elements.append(Spacer(1, 3 * mm))

        totals = [
            ['Subtotal', f"{sale.total_amount:,.0f}"],
            ['Paid', f"{sale.amount_paid:,.0f}"],
            ['Balance', f"{sale.balance:,.0f}"],
        ]
        totals_tbl = Table(totals, colWidths=[None, 40 * mm])
        totals_tbl.setStyle(TableStyle([
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -1), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(totals_tbl)
        elements.append(Spacer(1, 6 * mm))

        if shop.receipt_footer:
            elements.append(Paragraph(shop.receipt_footer, small_center))

        doc.build(elements)
        buffer.seek(0)
        resp = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="receipt_{sale.reference}.pdf"'
        return resp