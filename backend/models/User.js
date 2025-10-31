// models/User.js
const mongoose = require('mongoose');

const splitsSchema = new mongoose.Schema({
  savings: { type: Number, default: 30 },
  parents_preserve: { type: Number, default: 10 },
  extras_buffer: { type: Number, default: 10 },
  wants: { type: Number, default: 15 },
  needs: { type: Number, default: 35 }
}, { _id: false });

const SalaryHistorySchema = new mongoose.Schema({
  salary: { type: Number, required: true },
  startMonth: { type: String, default: '' }, // YYYY-MM
  extraIncome: { type: Number, default: 0 },
  splits: { type: splitsSchema, default: () => ({}) },
  automate: { type: Boolean, default: false },
  activeTracking: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  passwordHash: { type: String },

  // current active values
  salary: { type: Number, default: 0 },
  salaryFrequency: { type: String, default: 'monthly' },
  splits: { type: splitsSchema, default: () => ({}) },

  // persisted distribution (top-level, convenient for current month)
  distribution: { type: Map, of: Number, default: {} },

  // distribution by month: distributionByMonth['2025-10'] = {savings: 20000, needs:...}
  distributionByMonth: { type: Map, of: Object, default: {} },

  // presets
  preset: { type: String, enum: ['balanced', 'conservative', 'aggressive', null], default: 'balanced' },

  // onboarding / automation
  automate: { type: Boolean, default: false },
  activeTracking: { type: Boolean, default: false },
  startMonth: { type: String, default: '' }, // UI-chosen start month for active cycle
  subscribed: { type: Boolean, default: false },

  // salary history (old cycles)
  salaryHistory: { type: [SalaryHistorySchema], default: [] },

  // month lock: once a salary is set for 'YYYY-MM' we don't allow overwriting distribution for that month
  salaryLockedMonth: { type: String, default: '' },

  // last month for which automation ran (YYYY-MM) to avoid re-running
  lastAutomatedMonth: { type: String, default: '' },

  currency: { type: String, default: 'INR' },
  transactions: { type: Array, default: [] },

  // whether user finished basic onboarding (can't access dashboard otherwise)
  onboardComplete: { type: Boolean, default: false },

  resetToken: String,
  resetTokenExpires: Date
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);

