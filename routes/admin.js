var express    = require('express');
var router     = express.Router();
var adminAuth  = require('../middleware/adminAuth');
var HappyHour  = require('../models/HappyHour');
var PromoCode  = require('../models/PromoCode');
var Order      = require('../models/Order');

router.use(adminAuth);

// --- GET /admin ---
router.get('/', async function(_req, res) {
    try {
        const [totalOrders, confirmedOrders, todayOrders, pendingOrders, recentOrders] = await Promise.all([
            Order.countDocuments(),
            Order.aggregate([
                { $match: { status: 'confirmed' } },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Order.countDocuments({
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }),
            Order.countDocuments({ status: 'pending' }),
            Order.find().sort('-createdAt').limit(10)
        ]);

        const totalRevenue = confirmedOrders.length > 0 ? confirmedOrders[0].total : 0;

        res.render('admin/index', {
            title: 'Admin Dashboard',
            stats: { totalOrders, totalRevenue, todayOrders, pendingOrders },
            recentOrders
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

// --- GET /admin/happy-hours ---
router.get('/happy-hours', async function(_req, res) {
    try {
        const happyHours = await HappyHour.find().sort('-createdAt');
        res.render('admin/happy-hours', {
            title: 'Happy Hours',
            happyHours,
            message: null,
            error: null
        });
    } catch (err) {
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

// --- POST /admin/happy-hours ---
router.post('/happy-hours', async function(req, res) {
    try {
        const days = [].concat(req.body.days || []).map(Number);
        const cats = [].concat(req.body.applicableCategories || ['all']);
        await HappyHour.create({
            name:                  req.body.name,
            days,
            startHour:             parseInt(req.body.startHour, 10),
            endHour:               parseInt(req.body.endHour, 10),
            discountPercent:       parseInt(req.body.discountPercent, 10),
            applicableCategories:  cats,
            isActive:              req.body.isActive === '1'
        });
        const happyHours = await HappyHour.find().sort('-createdAt');
        res.render('admin/happy-hours', { title: 'Happy Hours', happyHours, message: 'Happy hour created.', error: null });
    } catch (err) {
        const happyHours = await HappyHour.find().sort('-createdAt');
        res.render('admin/happy-hours', { title: 'Happy Hours', happyHours, message: null, error: err.message });
    }
});

// --- POST /admin/happy-hours/:id/toggle ---
router.post('/happy-hours/:id/toggle', async function(req, res) {
    try {
        const hh = await HappyHour.findById(req.params.id);
        if (hh) { hh.isActive = !hh.isActive; await hh.save(); }
        res.redirect('/admin/happy-hours');
    } catch (err) {
        res.redirect('/admin/happy-hours');
    }
});

// --- POST /admin/happy-hours/:id/delete ---
router.post('/happy-hours/:id/delete', async function(req, res) {
    try {
        await HappyHour.findByIdAndDelete(req.params.id);
        res.redirect('/admin/happy-hours');
    } catch (err) {
        res.redirect('/admin/happy-hours');
    }
});

// --- GET /admin/promo-codes ---
router.get('/promo-codes', async function(_req, res) {
    try {
        const promoCodes = await PromoCode.find().sort('-createdAt');
        res.render('admin/promo-codes', { title: 'Promo Codes', promoCodes, message: null, error: null });
    } catch (err) {
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

// --- POST /admin/promo-codes ---
router.post('/promo-codes', async function(req, res) {
    try {
        const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
        await PromoCode.create({
            code:            (req.body.code || '').trim().toUpperCase(),
            discountPercent: parseInt(req.body.discountPercent, 10),
            expiresAt,
            usageLimit:      parseInt(req.body.usageLimit, 10) || 0,
            usageCount:      0,
            isActive:        req.body.isActive === '1'
        });
        const promoCodes = await PromoCode.find().sort('-createdAt');
        res.render('admin/promo-codes', { title: 'Promo Codes', promoCodes, message: 'Promo code created.', error: null });
    } catch (err) {
        const promoCodes = await PromoCode.find().sort('-createdAt');
        res.render('admin/promo-codes', { title: 'Promo Codes', promoCodes, message: null, error: err.message });
    }
});

// --- POST /admin/promo-codes/:id/toggle ---
router.post('/promo-codes/:id/toggle', async function(req, res) {
    try {
        const pc = await PromoCode.findById(req.params.id);
        if (pc) { pc.isActive = !pc.isActive; await pc.save(); }
        res.redirect('/admin/promo-codes');
    } catch (err) {
        res.redirect('/admin/promo-codes');
    }
});

// --- POST /admin/promo-codes/:id/delete ---
router.post('/promo-codes/:id/delete', async function(req, res) {
    try {
        await PromoCode.findByIdAndDelete(req.params.id);
        res.redirect('/admin/promo-codes');
    } catch (err) {
        res.redirect('/admin/promo-codes');
    }
});

module.exports = router;
