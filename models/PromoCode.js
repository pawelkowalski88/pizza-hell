const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

const PromoCodeSchema = new Schema({
    code:             { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountPercent:  { type: Number, required: true, min: 1, max: 99 },
    expiresAt:        { type: Date, default: null },
    usageLimit:       { type: Number, default: null }, // null = unlimited
    usageCount:       { type: Number, default: 0 },
    isActive:         { type: Boolean, default: true },
    createdAt:        { type: Date, default: Date.now }
});

// Validates a code without incrementing its usage counter.
// Returns the promo document or null.
PromoCodeSchema.statics.findValid = async function(code) {
    const promo = await this.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!promo)                                                    return null;
    if (promo.expiresAt && promo.expiresAt < new Date())           return null;
    if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) return null;
    return promo;
};

// Validates and atomically increments usageCount. Returns discountPercent.
PromoCodeSchema.statics.apply = async function(code) {
    const promo = await this.findValid(code);
    if (!promo) throw new Error('Invalid or expired promo code');
    await this.updateOne({ _id: promo._id }, { $inc: { usageCount: 1 } });
    return promo.discountPercent;
};

module.exports = mongoose.model('PromoCode', PromoCodeSchema);
