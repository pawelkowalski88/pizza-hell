const Pizza = require('../models/Pizza');

const CATEGORY_ORDER = ['classic', 'specialty', 'vegetarian', 'meat'];
const CATEGORY_NAMES = {
    classic:    'Classic Pizzas',
    specialty:  'Specialty Pizzas',
    vegetarian: 'Vegetarian',
    meat:       'Meat Lovers'
};

// Returns all available pizzas grouped by category.
// TODO: add a short-lived cache (e.g. 60s) — every menu page load hits MongoDB
async function getMenu() {
    const pizzas = await Pizza.find({ isAvailable: true }).sort('category name');
    const menu = {};
    for (const p of pizzas) {
        if (!menu[p.category]) menu[p.category] = [];
        menu[p.category].push(p);
    }
    return { menu, categoryOrder: CATEGORY_ORDER, categoryNames: CATEGORY_NAMES };
}

async function getByCategory(category) {
    return Pizza.find({ category, isAvailable: true }).sort('name');
}

// Called explicitly by OrderService after a successful order — not in a pre-save hook.
async function incrementOrderStats(pizzaId, qty) {
    await Pizza.updateOne(
        { _id: pizzaId },
        { $inc: { totalOrders: qty }, $set: { lastOrderDate: new Date() } }
    );
}

module.exports = { getMenu, getByCategory, incrementOrderStats, CATEGORY_ORDER, CATEGORY_NAMES };
