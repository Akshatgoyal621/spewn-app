const mongoose = require('mongoose');

const splitsSchema = new mongoose.Schema({
  savings: { type: Number, default: 30 },
  parents_preserve: { type: Number, default: 10 },
  extras_buffer: { type: Number, default: 10 },
  wants: { type: Number, default: 15 },
  needs: { type: Number, default: 35 }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  passwordHash: { type: String },
  salary: { type: Number, default: 0 },
  salaryFrequency: { type: String, default: 'monthly' },
  splits: {
    savings: { type: Number, default: 0 },
    parents_preserve: { type: Number, default: 0 },
    extras_buffer: { type: Number, default: 0 },
    wants: { type: Number, default: 0 },
    needs: { type: Number, default: 0 },
  },
  distribution: { type: Map, of: Number, default: {} }, // e.g. { savings: 20300, needs: 23200 }
  preset: { type: String, enum: ['balanced','conservative','aggressive', null], default: 'balanced' },
  currency: { type: String, default: 'INR' },
  transactions: { type: Array, default: [] },
  resetToken: String,
  resetTokenExpires: Date
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
