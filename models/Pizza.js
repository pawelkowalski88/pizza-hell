const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

const PizzaSchema = new Schema({
    name:                String,
    category:            String,   // classic | specialty | vegetarian | meat
    description:         String,
    basePrice:           Number,
    toppings:            [String],
    isAvailable:         { type: Boolean, default: true },
    rating:              { type: Number, default: 0 },
    ratingCount:         { type: Number, default: 0 },
    totalOrders:         { type: Number, default: 0 },
    lastOrderDate:       Date,
    popularityScore:     { type: Number, default: 0 },
    categoryDisplayName: String
});

PizzaSchema.index({ category: 1, isAvailable: 1 });

const CATEGORY_DISPLAY = {
    classic:    'Classic Pizzas',
    specialty:  'Specialty Pizzas',
    vegetarian: 'Vegetarian',
    meat:       'Meat Lovers'
};

// Pre-save: pure local calculations only — no DB calls, no cross-model mutations.
// Stats updates are done explicitly by OrderService after a successful order.
PizzaSchema.pre('save', function(next) {
    this.categoryDisplayName = CATEGORY_DISPLAY[this.category] || this.category;

    if (this.totalOrders > 0 && this.ratingCount > 0) {
        this.popularityScore = Math.round(
            (this.totalOrders * 0.6) + ((this.rating / 5) * this.ratingCount * 0.4)
        );
    }
    next();
});

module.exports = mongoose.model('Pizza', PizzaSchema);
