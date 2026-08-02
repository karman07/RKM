/**
 * One-time backfill: sets goldGramsAccumulated on existing investment subscriptions that
 * predate per-payment gold-rate tracking. Approximates using the CURRENT live gold rate
 * (settings.metal_rates.gold) applied to the subscription's total amountAccumulated, since
 * historical per-payment rates were never recorded before this change.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-gold-grams.ts          # dry run
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-gold-grams.ts --apply  # writes changes
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Subscription, SubscriptionDocument } from '../src/modules/gold-investment/schemas/subscription.schema';
import { SettingsService } from '../src/modules/settings/settings.service';

async function run() {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const subModel = app.get<Model<SubscriptionDocument>>(getModelToken(Subscription.name));
    const settingsService = app.get(SettingsService);

    const settings = await settingsService.get();
    const goldRate = (settings as any)?.metal_rates?.gold || 0;
    if (goldRate <= 0) {
      console.error('settings.metal_rates.gold is not set (0) — cannot backfill. Set the live gold rate first.');
      process.exitCode = 1;
      return;
    }

    const subs = await subModel
      .find({ goldGramsAccumulated: { $in: [0, null] }, amountAccumulated: { $gt: 0 } })
      .exec();

    console.log(`Gold rate used: ₹${goldRate}/g. ${subs.length} subscription(s) to backfill.`);

    for (const sub of subs) {
      const grams = sub.amountAccumulated / goldRate;
      console.log(`${apply ? 'Applying' : 'Would set'} sub ${sub._id}: amountAccumulated=₹${sub.amountAccumulated} -> goldGramsAccumulated=${grams.toFixed(4)}g`);
      if (apply) {
        sub.goldGramsAccumulated = grams;
        await sub.save();
      }
    }

    console.log(apply ? 'Backfill complete.' : 'Dry run complete — re-run with --apply to write changes.');
  } finally {
    await app.close();
  }
}

run().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
