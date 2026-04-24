var express      = require('express');
var router       = express.Router();
var PizzaService = require('../services/PizzaService');

var CATEGORY_ORDER = ['classic', 'specialty', 'vegetarian', 'meat_lovers'];
var CATEGORY_NAMES = {
    classic:    'Classic Pizzas',
    specialty:  'Specialty Pizzas',
    vegetarian: 'Vegetarian',
    meat_lovers: 'Meat Lovers'
};

router.get('/', async function(_req, res) {
    try {
        const menu = await PizzaService.getMenu();
        res.render('menu/index', {
            title:         'Our Menu',
            menu,
            categoryOrder: CATEGORY_ORDER,
            categoryNames: CATEGORY_NAMES,
            happyHour:     res.locals.happyHour
        });
    } catch (err) {
        console.error('Menu load error:', err);
        res.status(500).render('error', { status: 500, title: 'Menu unavailable', message: err.message });
    }
});

router.get('/:category', async function(req, res) {
    const category = req.params.category;
    if (!CATEGORY_NAMES[category]) {
        return res.status(404).render('error', { status: 404, title: 'Not Found', message: 'Category not found.' });
    }
    try {
        const pizzas = await PizzaService.getByCategory(category);
        res.render('menu/category', {
            title:         CATEGORY_NAMES[category],
            category,
            pizzas,
            categoryNames: CATEGORY_NAMES,
            happyHour:     res.locals.happyHour
        });
    } catch (err) {
        console.error('Category load error:', err);
        res.status(500).render('error', { status: 500, title: 'Error', message: err.message });
    }
});

module.exports = router;
