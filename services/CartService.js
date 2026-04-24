const Cart      = require('../models/Cart');
const Pizza     = require('../models/Pizza');
const PromoCode = require('../models/PromoCode');

const TAX_RATE = parseFloat(process.env.TAX_RATE || '0.085');

const SIZE_MULTIPLIERS = { small: 0.80, medium: 1.00, large: 1.30 };

// Pure function — no DB calls. Mutates cart in-place.
function recalcTotals(cart, happyHour) {
    let subtotal = 0;
    for (const item of cart.items) {
        const mult    = SIZE_MULTIPLIERS[item.size] || 1.0;
        item.itemTotal = Math.round(item.unitPrice * mult * item.quantity * 100) / 100;
        subtotal      += item.itemTotal;
    }
    cart.subtotal = Math.round(subtotal * 100) / 100;

    // Happy Hour: applies to matching categories (or 'all')
    let hhDiscount = 0;
    if (happyHour && happyHour.isActive) {
        const cats = happyHour.applicableCategories || ['all'];
        const appliesToAll = cats.includes('all');
        const hasMatch     = cart.items.some(i => cats.includes(i.pizzaCategory));
        if (appliesToAll || hasMatch) {
            hhDiscount = Math.round(cart.subtotal * (happyHour.discountPercent / 100) * 100) / 100;
        }
    }
    cart.happyHourDiscount = hhDiscount;

    // Promo discount applied on top of HH-reduced subtotal
    const promoBase    = cart.subtotal - hhDiscount;
    const promoDisc    = cart.promoDiscountPercent > 0
        ? Math.round(promoBase * (cart.promoDiscountPercent / 100) * 100) / 100
        : 0;
    cart.discount      = promoDisc;

    const taxable  = promoBase - promoDisc;
    cart.tax       = Math.round(taxable * TAX_RATE * 100) / 100;
    cart.total     = Math.round((taxable + cart.tax) * 100) / 100;
}

async function get(sessionId) {
    return Cart.findOne({ sessionId });
}

async function getOrCreate(sessionId) {
    return (await Cart.findOne({ sessionId })) || new Cart({ sessionId, items: [] });
}

async function addItem(sessionId, pizzaId, size, qty, happyHour) {
    if (!['small', 'medium', 'large'].includes(size)) size = 'medium';
    qty = Math.min(10, Math.max(1, parseInt(qty) || 1));

    // Validate pizza exists and is available — checked here, not in pre-save
    const pizza = await Pizza.findById(pizzaId);
    if (!pizza || !pizza.isAvailable) {
        const err = new Error('Pizza not available');
        err.status = 404;
        throw err;
    }

    const cart    = await getOrCreate(sessionId);
    const existing = cart.items.findIndex(
        i => i.pizzaId.toString() === String(pizzaId) && i.size === size
    );

    if (existing >= 0) {
        cart.items[existing].quantity = Math.min(10, cart.items[existing].quantity + qty);
    } else {
        cart.items.push({
            pizzaId:       pizza._id,
            pizzaName:     pizza.name,
            pizzaCategory: pizza.category,
            size,
            quantity:      qty,
            unitPrice:     pizza.basePrice,
            itemTotal:     0
        });
    }

    recalcTotals(cart, happyHour);
    await cart.save();
    return cart;
}

async function removeItem(sessionId, itemId, happyHour) {
    const cart = await Cart.findOne({ sessionId });
    if (!cart) return;
    cart.items = cart.items.filter(i => i._id.toString() !== itemId);
    recalcTotals(cart, happyHour);
    await cart.save();
    return cart;
}

// Validates the promo code but does NOT increment its usage count.
// Usage is incremented only when the order is actually placed (OrderService).
async function applyPromo(sessionId, code, happyHour) {
    const cart  = await Cart.findOne({ sessionId });
    if (!cart) throw new Error('Cart not found');
    const promo = await PromoCode.findValid(code);
    if (!promo) {
        const err = new Error('Invalid or expired promo code');
        err.status = 400;
        throw err;
    }
    cart.promoCode            = promo.code;
    cart.promoDiscountPercent = promo.discountPercent;
    recalcTotals(cart, happyHour);
    await cart.save();
    return cart;
}

async function clear(sessionId) {
    await Cart.deleteOne({ sessionId });
}

module.exports = { get, getOrCreate, addItem, removeItem, applyPromo, clear, recalcTotals };
