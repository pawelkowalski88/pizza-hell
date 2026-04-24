var express      = require('express');
var router       = express.Router();
var CartService  = require('../services/CartService');
var OrderService = require('../services/OrderService');
var Order        = require('../models/Order');

router.get('/checkout', async function(req, res) {
    try {
        const cart = await CartService.getOrCreate(req.session.id, res.locals.happyHour);
        if (!cart || cart.items.length === 0) return res.redirect('/');
        res.render('order/checkout', { title: 'Checkout', cart, error: null });
    } catch (err) {
        console.error('Checkout load error:', err);
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

router.post('/place', async function(req, res) {
    try {
        const order = await OrderService.placeOrder(req.session.id, req.body, res.locals.happyHour);
        res.redirect('/order/confirmation/' + order._id);
    } catch (err) {
        console.error('Place order error:', err);
        try {
            const cart = await CartService.getOrCreate(req.session.id, res.locals.happyHour);
            res.status(err.status || 400).render('order/checkout', {
                title: 'Checkout',
                cart,
                error: err.message
            });
        } catch (_) {
            res.status(500).render('error', { status: 500, title: 'Order failed', message: err.message });
        }
    }
});

router.get('/confirmation/:id', async function(req, res) {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).render('error', { status: 404, title: 'Not Found', message: 'Order not found.' });
        res.render('order/confirmation', { title: 'Order Confirmed!', order });
    } catch (err) {
        console.error('Confirmation load error:', err);
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

router.get('/history', async function(req, res) {
    try {
        const orders = await Order.find({ sessionId: req.session.id }).sort('-createdAt').limit(20);
        res.render('order/history', { title: 'Order History', orders });
    } catch (err) {
        console.error('Order history error:', err);
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

module.exports = router;
