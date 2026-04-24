var express     = require('express');
var router      = express.Router();
var CartService = require('../services/CartService');

router.get('/', async function(req, res) {
    try {
        const cart = await CartService.getOrCreate(req.session.id, res.locals.happyHour);
        const promoError = req.session.promoError || null;
        req.session.promoError = null;
        res.render('cart/index', { title: 'My Cart', cart, promoError });
    } catch (err) {
        console.error('Cart load error:', err);
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

router.post('/add', async function(req, res) {
    const { pizzaId, size, quantity } = req.body;
    try {
        await CartService.addItem(
            req.session.id,
            pizzaId,
            size || 'medium',
            parseInt(quantity, 10) || 1,
            res.locals.happyHour
        );
        const referer = req.get('Referer') || '/';
        res.redirect(referer);
    } catch (err) {
        console.error('Cart add error:', err);
        const status = err.status || 500;
        res.status(status).render('error', { status, title: 'Error', message: err.message });
    }
});

router.post('/remove', async function(req, res) {
    try {
        await CartService.removeItem(req.session.id, req.body.itemId, res.locals.happyHour);
        res.redirect('/cart');
    } catch (err) {
        console.error('Cart remove error:', err);
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

router.post('/promo', async function(req, res) {
    const code = (req.body.promoCode || '').trim().toUpperCase();
    if (!code) return res.redirect('/cart');
    try {
        await CartService.applyPromo(req.session.id, code, res.locals.happyHour);
        res.redirect('/cart');
    } catch (err) {
        req.session.promoError = err.message;
        res.redirect('/cart');
    }
});

module.exports = router;
