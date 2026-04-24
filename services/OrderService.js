const { v4: uuidv4 } = require('uuid');

const Order       = require('../models/Order');
const Cart        = require('../models/Cart');
const Pizza       = require('../models/Pizza');
const CartService = require('./CartService');
const PizzaService = require('./PizzaService');
const PromoCode   = require('../models/PromoCode');
const validators  = require('../lib/validators');
const payment     = require('../lib/payment');
const email       = require('../lib/email');

// Wraps the callback-style validators into promises
function validateAddress(raw) {
    return new Promise((resolve, reject) =>
        validators.validateAddress(raw, (err, result) => err ? reject(err) : resolve(result))
    );
}
function validatePayment(method, data) {
    return new Promise((resolve, reject) =>
        validators.validatePayment(method, data, (err, result) => err ? reject(err) : resolve(result))
    );
}
function chargePayment(method, data, amount) {
    return new Promise((resolve, reject) =>
        payment.processPayment(method, data, amount, (err, result) => err ? reject(err) : resolve(result))
    );
}

async function estimateDelivery() {
    const active = await Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'preparing'] } });
    return Math.min(30 + Math.floor(active / 3) * 5, 90);
}

// Places an order. Fixed payment flow:
//   1. Create order as 'pending'  ← record exists before any charge
//   2. Charge payment
//   3a. Payment OK  → update status to 'confirmed'
//   3b. Payment fail → update status to 'cancelled', throw
async function placeOrder(sessionId, body, happyHour) {
    const paymentMethod = body.paymentMethod || 'card';

    // Validate inputs in parallel
    const [validAddress, validPayment] = await Promise.all([
        validateAddress({ street: body.street, city: body.city, state: body.state, zipCode: body.zipCode, instructions: body.instructions || '' }),
        validatePayment(paymentMethod, { cardNumber: body.cardNumber, cardName: body.cardName, cardExpiry: body.cardExpiry, cardCvv: body.cardCvv, paypalEmail: body.paypalEmail })
    ]).catch(err => { err.status = 400; throw err; });

    // Load cart
    const cart = await Cart.findOne({ sessionId });
    if (!cart || cart.items.length === 0) {
        const err = new Error('Your cart is empty');
        err.status = 400;
        throw err;
    }

    // Check all pizzas are still available
    const pizzaIds      = cart.items.map(i => i.pizzaId);
    const availablePizzas = await Pizza.find({ _id: { $in: pizzaIds }, isAvailable: true });
    const availableSet  = new Set(availablePizzas.map(p => p._id.toString()));
    const gone          = cart.items.filter(i => !availableSet.has(i.pizzaId.toString()));
    if (gone.length > 0) {
        const err = new Error('Some items are no longer available: ' + gone.map(i => i.pizzaName).join(', '));
        err.status = 400;
        throw err;
    }

    // If there's a promo code, increment its usage counter now
    if (cart.promoCode) {
        try {
            await PromoCode.apply(cart.promoCode);
        } catch {
            // Code expired between add-to-cart and checkout — silently clear it
            cart.promoCode            = null;
            cart.promoDiscountPercent = 0;
            CartService.recalcTotals(cart, happyHour);
            await cart.save();
        }
    }

    const estimatedMinutes = await estimateDelivery();

    // STEP 1: Persist order as 'pending' BEFORE touching the payment gateway
    const order = new Order({
        orderNumber:              'ORD-' + uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase(),
        sessionId,
        items:                    cart.items.map(i => ({
            pizzaId:   i.pizzaId,
            pizzaName: i.pizzaName,
            size:      i.size,
            quantity:  i.quantity,
            unitPrice: i.unitPrice,
            itemTotal: i.itemTotal
        })),
        deliveryAddress:          validAddress,
        subtotal:                 cart.subtotal,
        happyHourDiscount:        cart.happyHourDiscount || 0,
        discount:                 cart.discount || 0,
        tax:                      cart.tax,
        total:                    cart.total,
        promoCode:                cart.promoCode || null,
        status:                   'pending',
        estimatedDeliveryMinutes: estimatedMinutes
    });
    await order.save();

    // STEP 2: Charge
    let pmtResult;
    try {
        pmtResult = await chargePayment(paymentMethod, validPayment, cart.total);
    } catch (pmtErr) {
        // Payment failed — record exists, nothing charged, mark cancelled
        order.status = 'cancelled';
        await order.save();
        pmtErr.status = 402;
        throw pmtErr;
    }

    // STEP 3: Payment succeeded — attach payment details and confirm
    order.payment = {
        method:        paymentMethod,
        last4:         pmtResult.last4 || null,
        cardType:      pmtResult.cardType || null,
        paypalEmail:   pmtResult.paypalEmail || null,
        transactionId: pmtResult.transactionId,
        amount:        cart.total,
        processedAt:   pmtResult.processedAt,
        status:        'approved'
    };
    order.status = 'confirmed';
    await order.save();

    // STEP 4: House-keeping (fire-and-forget — don't block the response)
    CartService.clear(sessionId).catch(err =>
        console.error('Cart clear failed for session', sessionId, err.message)
    );
    for (const item of order.items) {
        PizzaService.incrementOrderStats(item.pizzaId, item.quantity).catch(err =>
            console.error('Pizza stat update failed', item.pizzaId, err.message)
        );
    }
    email.sendOrderConfirmation(order, validAddress).catch(err =>
        console.error('Email failed for order', order.orderNumber, err.message)
    );

    return order;
}

async function getById(id) {
    return Order.findById(id);
}

async function getBySession(sessionId, limit) {
    return Order.find({ sessionId }).sort('-createdAt').limit(limit || 20);
}

module.exports = { placeOrder, getById, getBySession, estimateDelivery };
