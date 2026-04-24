// Cart model
// NOTE: the pre-save hook queries the pizza collection on EVERY save
// Dave added it after customer complained about ordering a discontinued pizza
// It costs us ~2 DB round-trips per cart operation but "it works"

var mongoose = require('mongoose');
var Schema   = mongoose.Schema;

var CartItemSchema = new Schema({
    pizzaId:       { type: Schema.Types.ObjectId, ref: 'Pizza' },
    pizzaName:     String,
    pizzaCategory: String,
    size:          { type: String, default: 'medium' },  // small | medium | large
    quantity:      { type: Number, default: 1, min: 1, max: 10 },
    unitPrice:     Number,
    itemTotal:     Number
});

var CartSchema = new Schema({
    sessionId:  { type: String, required: true, index: true },
    items:      [CartItemSchema],
    subtotal:   { type: Number, default: 0 },
    tax:        { type: Number, default: 0 },
    total:      { type: Number, default: 0 },
    promoCode:  String,
    discount:   { type: Number, default: 0 },
    createdAt:  { type: Date, default: Date.now },
    updatedAt:  { type: Date, default: Date.now }
});

// promo codes hardcoded here because "we'll move them to the DB soon"
// that was 2013
var PROMO_CODES = {
    'PIZZA10':  0.10,
    'SAVE20':   0.20,
    'NEWCUST':  0.15,
    'FREESHIP': 0     // delivery is always free anyway
};

var SIZE_MULTIPLIERS = {
    'small':  0.80,
    'medium': 1.00,
    'large':  1.30
};

// ---------------------------------------------------------------
// PRE-SAVE: recalculates totals AND validates pizza availability
// Two completely different responsibilities, one hook - classic
// ---------------------------------------------------------------
CartSchema.pre('save', function(next) {
    var cart    = this;
    cart.updatedAt = new Date();

    // --- step 1: recalculate every item total ---
    function recalcTotals(items) {
        var subtotal = 0;
        for (var i = 0; i < items.length; i++) {
            var item       = items[i];
            var multiplier = SIZE_MULTIPLIERS[item.size] || 1.0;
            item.itemTotal = Math.round(item.unitPrice * multiplier * item.quantity * 100) / 100;
            subtotal       += item.itemTotal;
        }
        return Math.round(subtotal * 100) / 100;
    }

    function applyPromoAndTax(cart) {
        var promoKey = cart.promoCode ? cart.promoCode.toUpperCase() : '';
        if (promoKey && PROMO_CODES[promoKey] !== undefined) {
            cart.discount = Math.round(cart.subtotal * PROMO_CODES[promoKey] * 100) / 100;
        } else {
            cart.discount = 0;
        }
        var taxable = cart.subtotal - cart.discount;
        cart.tax    = Math.round(taxable * 0.085 * 100) / 100;
        cart.total  = Math.round((taxable + cart.tax) * 100) / 100;
    }

    cart.subtotal = recalcTotals(cart.items);
    applyPromoAndTax(cart);

    // --- step 2: validate pizza availability (DB query inside pre-save) ---
    if (cart.items.length === 0) {
        next();
        return;
    }

    var Pizza    = require('./Pizza');
    var pizzaIds = cart.items.map(function(item) { return item.pizzaId; });

    Pizza.find({ _id: { $in: pizzaIds }, isAvailable: true }, function(err, availablePizzas) {
        if (err) {
            console.log('Availability check failed in Cart.pre(save): ' + err);
            next(); // save anyway, better than crashing
            return;
        }

        var availableIds = availablePizzas.map(function(p) { return p._id.toString(); });

        var removed = [];
        cart.items = cart.items.filter(function(item) {
            var ok = availableIds.indexOf(item.pizzaId.toString()) !== -1;
            if (!ok) removed.push(item.pizzaName);
            return ok;
        });

        if (removed.length > 0) {
            console.log('Cart: removed unavailable items: ' + removed.join(', '));
        }

        // recalc again after filtering - copy-paste because "we'll refactor later"
        cart.subtotal = recalcTotals(cart.items);
        applyPromoAndTax(cart);

        next();
    });
});

module.exports = mongoose.model('Cart', CartSchema);
