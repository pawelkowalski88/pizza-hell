// Menu routes
// NOTE: HTML is built inline because "templates were slow in profiling" (2013 profiling)
// TODO: move to jade templates (on backlog since 2014)

var express = require('express');
var router  = express.Router();
var Pizza   = require('../models/Pizza');

var CATEGORY_ORDER = ['classic', 'specialty', 'vegetarian', 'meat'];
var CATEGORY_NAMES = {
    'classic':    'Classic Pizzas',
    'specialty':  'Specialty Pizzas',
    'vegetarian': 'Vegetarian',
    'meat':       'Meat Lovers'
};

// ---------- shared HTML helpers (copy-pasted into cart.js and orders.js too) ----------
function pageHeader(title) {
    return '<!DOCTYPE html>\n' +
        '<html>\n<head>\n' +
        '  <meta charset="utf-8">\n' +
        '  <title>' + title + ' | PizzaLand</title>\n' +
        '  <style>\n' +
        '    body{font-family:Arial,sans-serif;max-width:960px;margin:0 auto;padding:20px;background:#fff8f0}' +
        '    h1{color:#c0392b}' +
        '    .nav{background:#c0392b;padding:12px 20px;margin:-20px -20px 20px}' +
        '    .nav a{color:#fff;margin-right:18px;text-decoration:none;font-weight:bold}' +
        '    .nav a:hover{text-decoration:underline}' +
        '    .cat-nav{margin-bottom:20px}' +
        '    .cat-nav a{display:inline-block;padding:7px 14px;margin:3px;background:#eee;text-decoration:none;color:#333;border-radius:3px}' +
        '    .cat-nav a:hover,.cat-nav a.active{background:#c0392b;color:#fff}' +
        '    .pizza-card{border:1px solid #ddd;padding:15px;margin:10px 0;background:#fff;border-radius:4px}' +
        '    .pizza-name{font-size:1.2em;font-weight:bold;color:#c0392b;margin-bottom:4px}' +
        '    .price{font-size:1.15em;color:#27ae60;font-weight:bold;margin:6px 0}' +
        '    .toppings{color:#666;font-size:.88em;margin:4px 0}' +
        '    .stars{color:#f39c12;letter-spacing:2px}' +
        '    .btn{background:#c0392b;color:#fff;border:none;padding:8px 16px;cursor:pointer;border-radius:3px}' +
        '    .btn:hover{background:#a93226}' +
        '    .btn-green{background:#27ae60}' +
        '    .btn-green:hover{background:#219a52}' +
        '    table{border-collapse:collapse;width:100%}' +
        '    td,th{padding:8px;border:1px solid #ddd;text-align:left}' +
        '    th{background:#f5f5f5}' +
        '  </style>\n' +
        '</head>\n<body>\n' +
        '<div class="nav">\n' +
        '  <a href="/">&#127829; PizzaLand</a>\n' +
        '  <a href="/cart">&#128722; Cart</a>\n' +
        '  <a href="/order/history">Order History</a>\n' +
        '</div>\n';
}

function pageFooter() {
    return '\n<hr style="margin-top:40px">\n' +
        '<p style="color:#aaa;font-size:.8em;text-align:center">' +
        'PizzaLand Online &copy; 2013 &ndash; 2014 | Free delivery on orders over $25 | ' +
        'Questions? Call 555-PIZZA</p>\n' +
        '</body>\n</html>';
}

function buildStars(rating) {
    var stars = '';
    var full  = Math.floor(rating || 0);
    for (var i = 0; i < full; i++)      stars += '&#9733;';
    for (var j = full; j < 5; j++)     stars += '&#9734;';
    return stars;
}

function buildPizzaCard(p) {
    var html = '';
    html += '<div class="pizza-card">\n';
    html += '  <div class="pizza-name">' + p.name + '</div>\n';
    html += '  <div>' + p.description + '</div>\n';
    html += '  <div class="toppings">Toppings: ' + p.toppings.join(', ') + '</div>\n';
    html += '  <div class="stars">' + buildStars(p.rating) +
            ' <small style="color:#999">(' + p.ratingCount + ' reviews)</small></div>\n';
    html += '  <div class="price">From $' + p.basePrice.toFixed(2) + '</div>\n';
    html += '  <form action="/cart/add" method="POST" style="margin-top:10px">\n';
    html += '    <input type="hidden" name="pizzaId"       value="' + p._id + '">\n';
    html += '    <input type="hidden" name="pizzaName"     value="' + p.name + '">\n';
    html += '    <input type="hidden" name="pizzaCategory" value="' + p.category + '">\n';
    html += '    <input type="hidden" name="unitPrice"     value="' + p.basePrice + '">\n';
    html += '    <label>Size: <select name="size">\n';
    html += '      <option value="small">Small  &ndash;20%  $' + (p.basePrice * 0.8).toFixed(2) + '</option>\n';
    html += '      <option value="medium" selected>Medium  $' + p.basePrice.toFixed(2) + '</option>\n';
    html += '      <option value="large">Large  +30%  $' + (p.basePrice * 1.3).toFixed(2) + '</option>\n';
    html += '    </select></label>&nbsp;\n';
    html += '    <label>Qty: <input type="number" name="quantity" value="1" min="1" max="10" style="width:50px"></label>&nbsp;\n';
    html += '    <button type="submit" class="btn">Add to Cart</button>\n';
    html += '  </form>\n';
    html += '</div>\n';
    return html;
}

// ---- GET / - full menu ----
router.get('/', function(req, res) {
    // no caching - every request hits MongoDB
    // Dave said adding a cache is "premature optimisation"
    Pizza.find({ isAvailable: true }).sort('category name').exec(function(err, allPizzas) {
        if (err) {
            console.log('Menu load error: ' + err);
            res.send(500, pageHeader('Error') + '<h2>Failed to load menu. Please try again.</h2>' + pageFooter());
            return;
        }

        if (!allPizzas || allPizzas.length === 0) {
            res.send(pageHeader('Menu') + '<p>Menu is temporarily unavailable.</p>' + pageFooter());
            return;
        }

        // group by category in JS because doing it in Mongoose aggregate seemed "complicated"
        var categories = {};
        for (var i = 0; i < allPizzas.length; i++) {
            var p = allPizzas[i];
            if (!categories[p.category]) {
                categories[p.category] = [];
            }
            categories[p.category].push(p);
        }

        var html = pageHeader('Our Menu');
        html += '<h1>Our Menu</h1>\n';
        html += '<p>Order online &mdash; hot fresh pizza delivered to your door.</p>\n';

        // category navigation bar
        html += '<div class="cat-nav">\n  <strong>Jump to:</strong>&nbsp;\n';
        for (var ci = 0; ci < CATEGORY_ORDER.length; ci++) {
            var cat = CATEGORY_ORDER[ci];
            if (categories[cat]) {
                html += '  <a href="#cat-' + cat + '">' + CATEGORY_NAMES[cat] + '</a>\n';
            }
        }
        html += '</div>\n';

        // each category section
        for (var catIdx = 0; catIdx < CATEGORY_ORDER.length; catIdx++) {
            var catKey    = CATEGORY_ORDER[catIdx];
            var catPizzas = categories[catKey];

            if (!catPizzas || catPizzas.length === 0) continue;

            html += '<div id="cat-' + catKey + '" style="margin-bottom:30px">\n';
            html += '<h2 style="border-bottom:2px solid #c0392b;padding-bottom:5px">' +
                    CATEGORY_NAMES[catKey] + '</h2>\n';

            for (var pi = 0; pi < catPizzas.length; pi++) {
                html += buildPizzaCard(catPizzas[pi]);
            }

            html += '</div>\n';
        }

        html += pageFooter();
        res.send(html);
    });
});

// ---- GET /menu/:category - filtered view ----
router.get('/menu/:category', function(req, res) {
    var category = req.params.category;

    if (CATEGORY_ORDER.indexOf(category) === -1) {
        res.send(404, pageHeader('Not Found') + '<h2>Category not found</h2><a href="/">Back to menu</a>' + pageFooter());
        return;
    }

    Pizza.find({ category: category, isAvailable: true }).sort('name').exec(function(err, pizzas) {
        if (err) {
            res.send(500, pageHeader('Error') + '<h2>Error loading category</h2>' + pageFooter());
            return;
        }

        var catName = CATEGORY_NAMES[category];
        var html    = pageHeader(catName);
        html += '<h1>' + catName + '</h1>\n';

        html += '<div class="cat-nav">\n';
        for (var c in CATEGORY_NAMES) {
            var cls = (c === category) ? ' class="active"' : '';
            html += '<a href="/menu/' + c + '"' + cls + '>' + CATEGORY_NAMES[c] + '</a>\n';
        }
        html += '<a href="/">All Categories</a>\n';
        html += '</div>\n';

        if (pizzas.length === 0) {
            html += '<p>No pizzas available in this category right now.</p>\n';
        } else {
            for (var i = 0; i < pizzas.length; i++) {
                html += buildPizzaCard(pizzas[i]);
            }
        }

        html += pageFooter();
        res.send(html);
    });
});

// export helpers so other route files can NOT use them and copy-paste instead
module.exports        = router;
module.exports.header = pageHeader;
module.exports.footer = pageFooter;
