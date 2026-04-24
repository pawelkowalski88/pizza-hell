// Cart routes
// NOTE: pageHeader/pageFooter are copy-pasted from menu.js because
// "the require was causing weird issues" (Dave, 2013 - issue never investigated)

var express = require('express');
var router  = express.Router();
var Pizza   = require('../models/Pizza');
var Cart    = require('../models/Cart');

// ---- copy-paste from menu.js (see note above) ----
function pageHeader(title) {
    return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n' +
        '<title>' + title + ' | PizzaLand</title>\n' +
        '<style>\n' +
        'body{font-family:Arial,sans-serif;max-width:960px;margin:0 auto;padding:20px;background:#fff8f0}' +
        'h1{color:#c0392b}' +
        '.nav{background:#c0392b;padding:12px 20px;margin:-20px -20px 20px}' +
        '.nav a{color:#fff;margin-right:18px;text-decoration:none;font-weight:bold}' +
        'table{border-collapse:collapse;width:100%}td,th{padding:9px;border:1px solid #ddd}' +
        'th{background:#f5f5f5}.btn{background:#c0392b;color:#fff;border:none;padding:7px 14px;cursor:pointer}' +
        '.btn-green{background:#27ae60;color:#fff;border:none;padding:10px 22px;font-size:1em;cursor:pointer;text-decoration:none;display:inline-block}' +
        '.notice{background:#d4edda;border:1px solid #c3e6cb;padding:10px;margin:10px 0}' +
        '.warn{background:#fff3cd;border:1px solid #ffeeba;padding:10px;margin:10px 0}' +
        '</style>\n</head>\n<body>\n' +
        '<div class="nav"><a href="/">&#127829; PizzaLand</a><a href="/cart">&#128722; Cart</a><a href="/order/history">Order History</a></div>\n';
}
function pageFooter() {
    return '<hr style="margin-top:40px"><p style="color:#aaa;font-size:.8em;text-align:center">PizzaLand Online &copy; 2013</p></body></html>';
}

// ---- GET /cart ----
router.get('/', function(req, res) {
    var sessionId = req.session.id;

    Cart.findOne({ sessionId: sessionId }, function(err, cart) {
        if (err) {
            console.log('Cart.findOne error: ' + err);
            res.send(500, pageHeader('Error') + '<p>Error loading cart</p>' + pageFooter());
            return;
        }

        var html = pageHeader('My Cart');
        html += '<h1>&#128722; My Cart</h1>\n';

        if (!cart || cart.items.length === 0) {
            html += '<div class="warn"><p>Your cart is empty.</p></div>\n';
            html += '<a href="/" class="btn-green">Browse Menu</a>\n';
            html += pageFooter();
            res.send(html);
            return;
        }

        // check for session-level promo error message
        var promoError = req.session.promoError;
        if (promoError) {
            html += '<div class="warn">' + promoError + '</div>\n';
            req.session.promoError = null;
        }

        html += '<table>\n';
        html += '<tr><th>Pizza</th><th>Size</th><th>Qty</th><th>Unit Price</th><th>Total</th><th></th></tr>\n';

        for (var i = 0; i < cart.items.length; i++) {
            var item = cart.items[i];
            html += '<tr>\n';
            html += '<td>' + item.pizzaName + '</td>\n';
            html += '<td style="text-transform:capitalize">' + item.size + '</td>\n';
            html += '<td>' + item.quantity + '</td>\n';
            html += '<td>$' + item.unitPrice.toFixed(2) + '</td>\n';
            html += '<td><strong>$' + item.itemTotal.toFixed(2) + '</strong></td>\n';
            html += '<td><form action="/cart/remove" method="POST" style="margin:0">' +
                    '<input type="hidden" name="itemId" value="' + item._id + '">' +
                    '<button type="submit" class="btn" style="font-size:.8em;padding:4px 8px">&#10005; Remove</button>' +
                    '</form></td>\n';
            html += '</tr>\n';
        }

        html += '</table>\n<br>\n';

        // totals block
        html += '<table style="width:300px;float:right">\n';
        html += '<tr><td>Subtotal</td><td style="text-align:right">$' + cart.subtotal.toFixed(2) + '</td></tr>\n';
        if (cart.discount > 0) {
            html += '<tr style="color:green"><td>Discount (' + cart.promoCode + ')</td>' +
                    '<td style="text-align:right">-$' + cart.discount.toFixed(2) + '</td></tr>\n';
        }
        html += '<tr><td>Tax (8.5%)</td><td style="text-align:right">$' + cart.tax.toFixed(2) + '</td></tr>\n';
        html += '<tr><th>Order Total</th><th style="text-align:right;color:#27ae60">$' + cart.total.toFixed(2) + '</th></tr>\n';
        html += '</table>\n';
        html += '<div style="clear:both"></div><br>\n';

        // promo code form
        html += '<form action="/cart/promo" method="POST" style="margin-bottom:15px">\n';
        html += '<label>Promo code: <input type="text" name="promoCode" placeholder="e.g. PIZZA10"' +
                (cart.promoCode ? ' value="' + cart.promoCode + '"' : '') + '></label>&nbsp;\n';
        html += '<button type="submit" class="btn">Apply</button>\n';
        html += '</form>\n';

        html += '<a href="/order/checkout" class="btn-green">&#9654; Proceed to Checkout &mdash; $' + cart.total.toFixed(2) + '</a>';
        html += '&nbsp;&nbsp;<a href="/">Continue Shopping</a>\n';

        html += pageFooter();
        res.send(html);
    });
});

// ---- POST /cart/add ----
// Level 1: validate input
// Level 2: verify pizza in DB (don't trust client-submitted price)
// Level 3: find or create cart
// Level 4: save cart (triggers pre-save: availability check + recalc)
router.post('/add', function(req, res) {
    var sessionId = req.session.id;
    var pizzaId   = req.body.pizzaId;
    var size      = req.body.size || 'medium';
    var quantity  = parseInt(req.body.quantity, 10) || 1;

    // LEVEL 1 - basic input check
    if (!pizzaId) {
        res.send(400, pageHeader('Error') + '<p>Missing pizza ID</p><a href="/">Back</a>' + pageFooter());
        return;
    }
    if (['small', 'medium', 'large'].indexOf(size) === -1) {
        size = 'medium';
    }
    if (quantity < 1 || quantity > 10) {
        quantity = 1;
    }

    // LEVEL 2 - verify pizza exists and use DB price (not submitted price)
    Pizza.findById(pizzaId, function(err, pizza) {
        if (err) {
            console.log('Pizza.findById error in /cart/add: ' + err);
            res.send(500, pageHeader('Error') + '<p>Error adding to cart</p>' + pageFooter());
            return;
        }
        if (!pizza) {
            res.send(404, pageHeader('Not Found') + '<p>Pizza not found</p><a href="/">Back</a>' + pageFooter());
            return;
        }
        if (!pizza.isAvailable) {
            res.send(400, pageHeader('Unavailable') +
                '<p>Sorry, <strong>' + pizza.name + '</strong> is not currently available.</p>' +
                '<a href="/">Back to menu</a>' + pageFooter());
            return;
        }

        // LEVEL 3 - find or create cart for this session
        Cart.findOne({ sessionId: sessionId }, function(err, cart) {
            if (err) {
                console.log('Cart.findOne error in /cart/add: ' + err);
                res.send(500, pageHeader('Error') + '<p>Error loading cart</p>' + pageFooter());
                return;
            }

            if (!cart) {
                cart = new Cart({ sessionId: sessionId, items: [] });
            }

            // check if same pizza+size already in cart -> increment quantity
            var existingIdx = -1;
            for (var i = 0; i < cart.items.length; i++) {
                if (cart.items[i].pizzaId.toString() === pizzaId &&
                    cart.items[i].size === size) {
                    existingIdx = i;
                    break;
                }
            }

            if (existingIdx >= 0) {
                cart.items[existingIdx].quantity += quantity;
                if (cart.items[existingIdx].quantity > 10) {
                    cart.items[existingIdx].quantity = 10;
                }
            } else {
                cart.items.push({
                    pizzaId:       pizza._id,
                    pizzaName:     pizza.name,
                    pizzaCategory: pizza.category,
                    size:          size,
                    quantity:      quantity,
                    unitPrice:     pizza.basePrice,
                    itemTotal:     0    // pre-save recalculates
                });
            }

            // LEVEL 4 - save (Cart.pre(save) fires: availability check + total recalc)
            cart.save(function(err) {
                if (err) {
                    console.log('Cart.save error in /cart/add: ' + err);
                    res.send(500, pageHeader('Error') + '<p>Error saving cart</p>' + pageFooter());
                    return;
                }

                // go back where the user came from, or fall back to menu
                var referer = req.header('Referer') || '/';
                res.redirect(referer);
            });
        });
    });
});

// ---- POST /cart/remove ----
router.post('/remove', function(req, res) {
    var sessionId = req.session.id;
    var itemId    = req.body.itemId;

    if (!itemId) {
        res.send(400, 'Missing item ID');
        return;
    }

    Cart.findOne({ sessionId: sessionId }, function(err, cart) {
        if (err || !cart) {
            res.send(404, pageHeader('Error') + '<p>Cart not found</p>' + pageFooter());
            return;
        }

        var before = cart.items.length;
        cart.items = cart.items.filter(function(item) {
            return item._id.toString() !== itemId;
        });

        if (cart.items.length === before) {
            // item wasn't found - just redirect, not worth erroring
            res.redirect('/cart');
            return;
        }

        cart.save(function(err) {
            if (err) {
                console.log('Cart.save error in /cart/remove: ' + err);
                res.send(500, 'Error updating cart');
                return;
            }
            res.redirect('/cart');
        });
    });
});

// ---- POST /cart/promo ----
router.post('/promo', function(req, res) {
    var sessionId = req.session.id;
    var promoCode = (req.body.promoCode || '').trim().toUpperCase();

    if (!promoCode) {
        res.redirect('/cart');
        return;
    }

    Cart.findOne({ sessionId: sessionId }, function(err, cart) {
        if (err || !cart) {
            res.send(404, pageHeader('Error') + '<p>Cart not found</p>' + pageFooter());
            return;
        }

        cart.promoCode = promoCode;

        cart.save(function(err, savedCart) {
            if (err) {
                console.log('Cart.save error in /cart/promo: ' + err);
                res.send(500, 'Error applying promo code');
                return;
            }

            if (savedCart.discount === 0) {
                req.session.promoError = 'Promo code "' + promoCode + '" is invalid or expired.';
            }

            res.redirect('/cart');
        });
    });
});

module.exports = router;
