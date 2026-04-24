const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

const CartItemSchema = new Schema({
    pizzaId:       { type: Schema.Types.ObjectId, ref: 'Pizza' },
    pizzaName:     String,
    pizzaCategory: String,
    size:          { type: String, default: 'medium' },
    quantity:      { type: Number, default: 1, min: 1, max: 10 },
    unitPrice:     Number,
    itemTotal:     Number
});

const CartSchema = new Schema({
    sessionId:            { type: String, required: true },
    items:                [CartItemSchema],
    subtotal:             { type: Number, default: 0 },
    happyHourDiscount:    { type: Number, default: 0 },
    discount:             { type: Number, default: 0 }, // promo discount amount
    tax:                  { type: Number, default: 0 },
    total:                { type: Number, default: 0 },
    promoCode:            String,
    promoDiscountPercent: { type: Number, default: 0 },
    createdAt:            { type: Date, default: Date.now },
    updatedAt:            { type: Date, default: Date.now }
});

CartSchema.index({ sessionId: 1 });

// Pre-save stripped of all business logic — just keep the timestamp.
// All recalculation and validation is done by CartService before save() is called.
CartSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Cart', CartSchema);
