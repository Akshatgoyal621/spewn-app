// scripts/backfill-distributionByMonth.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const { MONGODB_URI } = process.env;

async function main() {
  if (!MONGODB_URI) {
    console.error('Set MONGODB_URI in .env before running migration');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const currentMonth = new Date().toISOString().slice(0,7);
  console.log('Migration: backfilling distributionByMonth for month', currentMonth);

  const cursor = User.find({}).cursor();
  let count = 0;
  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    const hasTopDistribution = user.distribution && Object.keys(user.distribution || {}).length > 0;
    const hasMonthEntry = user.distributionByMonth && user.distributionByMonth.get && user.distributionByMonth.get(currentMonth);
    // Mongoose Map may be a plain object or Map; check both
    const hasMonthEntryObj = user.distributionByMonth && (user.distributionByMonth[currentMonth] || (user.distributionByMonth.get && user.distributionByMonth.get(currentMonth)));
    if (hasTopDistribution && !hasMonthEntryObj) {
      // read distribution into plain object
      const top = {};
      // distribution might be a Map-like
      if (user.distribution.forEach) {
        user.distribution.forEach((v, k) => (top[k] = v));
      } else if (typeof user.distribution === 'object') {
        Object.keys(user.distribution).forEach(k => (top[k] = user.distribution[k]));
      }
      // set distributionByMonth[currentMonth] = top
      const setObj = {};
      setObj[`distributionByMonth.${currentMonth}`] = top;

      // also set startMonth if missing
      if (!user.startMonth || user.startMonth === '') {
        setObj.startMonth = currentMonth;
      }
      // mark onboardComplete if salary/splits present
      const onboard = user.salary && Object.keys(user.splits || {}).length ? true : Boolean(user.onboardComplete);
      if (onboard) setObj.onboardComplete = true;

      await User.findByIdAndUpdate(user._id, { $set: setObj });
      console.log(`Updated user ${user.email || user._id} — backfilled distributionByMonth`);
      count++;
    }
  }

  console.log(`Migration complete. Updated ${count} users.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});
