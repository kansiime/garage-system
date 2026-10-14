from django.core.management.base import BaseCommand
from django.db import transaction

from apps.debts.models import Debt, DebtCharge, DebtPayment
from apps.debts.services import _same_party


class Command(BaseCommand):
    help = ("Merge unpaid debts that belong to the same party (same phone, or same "
            "name) into one running debt. Dry run unless --apply is given.")

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually merge.')

    def handle(self, *args, apply=False, **opts):
        groups = []
        for debt in Debt.objects.exclude(status='paid').order_by('created_at', 'id'):
            for g in groups:
                if g[0].debt_type == debt.debt_type and _same_party(g[0], debt.party_name, debt.party_phone):
                    g.append(debt)
                    break
            else:
                groups.append([debt])

        dupes = [g for g in groups if len(g) > 1]
        if not dupes:
            self.stdout.write('No duplicate open debts found.')
            return

        for keep, *others in dupes:
            total = sum((d.balance for d in [keep, *others]))
            self.stdout.write(
                f'{keep.debt_type}: {keep.party_name} — merging {len(others)} debt(s) '
                f'into #{keep.id} (combined balance {total:,.2f})'
            )
            if not apply:
                continue
            with transaction.atomic():
                for d in others:
                    DebtCharge.objects.filter(debt=d).update(debt=keep)
                    DebtPayment.objects.filter(debt=d).update(debt=keep)
                    keep.amount += d.amount
                    keep.amount_paid += d.amount_paid
                    if not keep.party_phone and d.party_phone:
                        keep.party_phone = d.party_phone
                    if d.promised_date and (not keep.promised_date or d.promised_date < keep.promised_date):
                        keep.promised_date = d.promised_date
                    d.delete()
                keep.update_status()

        if not apply:
            self.stdout.write(self.style.WARNING('Dry run — re-run with --apply to merge.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Merged {len(dupes)} group(s).'))
