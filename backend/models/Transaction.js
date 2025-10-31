const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  bucket: { type: String, required: true },
  category: { type: String },
  amount: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);