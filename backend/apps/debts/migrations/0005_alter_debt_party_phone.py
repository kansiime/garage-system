from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('debts', '0004_backfill_debt_charges'),
    ]

    operations = [
        # Match Supplier.phone so supplier payables can carry the full number
        migrations.AlterField(
            model_name='debt',
            name='party_phone',
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
