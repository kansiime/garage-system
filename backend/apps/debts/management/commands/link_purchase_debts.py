from django.core.management.base import BaseCommand
from django.db import transaction

from apps.debts import services
from apps.debts.models import Debt, DebtCharge
from apps.purchases.models import Purchase


class Command(BaseCommand):
    help = ("Create the missing supplier debt for purchases saved before purchases "
            "booked their unpaid balance as a payable. Dry run unless --apply is given.")

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually create the debts.')

    def handle(self, *args, apply=False, **opts):
        # Open payables with a hand-entered charge (not from a purchase) may
        # already cover old purchase balances, so leave those suppliers alone.
        manual = [
            d for d in Debt.objects.filter(debt_type='payable').exclude(status='paid')
            if d.charges.filter(purchase__isnull=True, amount__gt=0).exists()
        ]

        to_link, skipped = [], []
        purchases = (Purchase.objects.exclude(status='cancelled')
                     .select_related('supplier').order_by('created_at', 'id'))
        for p in purchases:
            if p.balance <= 0 or DebtCharge.objects.filter(purchase=p).exists():
                continue
            if p.supplier is None:
                skipped.append((p, 'no supplier on the purchase'))
                continue
            clash = next((d for d in manual
                          if services._same_party(d, p.supplier.name, p.supplier.phone)), None)
            if clash:
                skipped.append((p, f'{p.supplier.name} has a hand-entered debt #{clash.id} '
                                   f'(balance {clash.balance:,.2f}) — check it on the Debts page'))
                continue
            to_link.append(p)

        for p in to_link:
            self.stdout.write(f'LINK  {p.reference}  {p.supplier.name}  balance {p.balance:,.2f}')
        for p, why in skipped:
            self.stdout.write(self.style.WARNING(f'SKIP  {p.reference}  balance {p.balance:,.2f} — {why}'))
        if not to_link and not skipped:
            self.stdout.write('Every purchase with a balance already has a supplier debt.')
            return

        if not apply:
            self.stdout.write(self.style.WARNING(
                f'Dry run — {len(to_link)} purchase(s) would be linked. Re-run with --apply.'))
            return

        with transaction.atomic():
            for p in to_link:
                services.add_charge(
                    debt_type='payable', party_name=p.supplier.name,
                    party_phone=p.supplier.phone or '', amount=p.balance,
                    reference=p.reference, purchase=p, user=p.user,
                    notes=f'Balance from purchase {p.reference}',
                )
                # Date it like the purchase so supplier payments clear oldest first
                DebtCharge.objects.filter(purchase=p).update(created_at=p.created_at)
        self.stdout.write(self.style.SUCCESS(f'Linked {len(to_link)} purchase(s).'))
