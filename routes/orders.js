// Order routes
// POST /order/place is the main event - 8 levels of nested callbacks
// DO NOT refactor without running the full integration test (we dont have one)
// Dave said "if it ain't broke don't fix it" - last reviewed 2014

var express    = require('express');
var router     = express.Router();
var Pizza      = require('../models/Pizza');
var Cart       = require('../models/Cart');
var Order      = require('../models/Order');
var validators = require('../lib/validators');
var payment    = require('../lib/payment');

// ---- copy-paste #3 of pageHeader/pageFooter (see menu.js and cart.js for #1 and #2) ----
function pageHeader(title) {
    return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n' +
        '<title>' + title + ' | PizzaLand</title>\n' +
        '<style>\n' +
        'body{font-family:Arial,sans-serif;max-width:960px;margin:0 auto;padding:20px;background:#fff8f0}' +
        'h1{color:#c0392b}h2{color:#333;margin-top:25px}' +
        '.nav{background:#c0392b;padding:12px 20px;margin:-20px -20px 20px}' +
        '.nav a{color:#fff;margin-right:18px;text-decoration:none;font-weight:bold}' +
        'table{border-collapse:collapse;width:100%}td,th{padding:9px;border:1px solid #ddd}' +
        'th{background:#f5f5f5}' +
        '.confirm-box{background:#d4edda;border:2px solid #28a745;padding:20px;text-align:center;border-radius:6px;margin:20px 0}' +
        '.error-box{background:#f8d7da;border:1px solid #f5c6cb;padding:15px;border-radius:4px;margin:10px 0}' +
        '.layout{display:flex;gap:30px;align-items:flex-start}' +
        '.layout .col1{flex:1}.layout .col2{flex:2}' +
        'label{display:block;margin-bottom:4px;font-weight:bold}' +
        'input[type=text],input[type=email],textarea,select{width:100%;padding:7px;border:1px solid #ccc;border-radius:3px;box-sizing:border-box}' +
        '.form-group{margin-bottom:14px}' +
        '.payment-section{border:1px solid #ddd;padding:15px;border-radius:4px;margin-top:10px}' +
        '.btn-place{background:#27ae60;color:#fff;border:none;padding:14px 30px;font-size:1.1em;cursor:pointer;border-radius:4px;width:100%;margin-top:15px}' +
        '.btn-place:hover{background:#219a52}' +
        '</style>\n</head>\n<body>\n' +
        '<div class="nav"><a href="/">&#127829; PizzaLand</a><a href="/cart">&#128722; Cart</a><a href="/order/history">Order History</a></div>\n';
}
function pageFooter() {
    return '<hr style="margin-top:40px"><p style="color:#aaa;font-size:.8em;text-align:center">PizzaLand Online &copy; 2013</p></body></html>';
}

// ---- GET /order/checkout ----
router.get('/checkout', function(req, res) {
    var sessionId = req.session.id;

    Cart.findOne({ sessionId: sessionId }, function(err, cart) {
        if (err) {
            console.log('Cart load error in /checkout: ' + err);
            res.send(500, pageHeader('Error') + '<p>Error loading cart</p>' + pageFooter());
            return;
        }

        if (!cart || cart.items.length === 0) {
            res.redirect('/');
            return;
        }

        var html = pageHeader('Checkout');
        html += '<h1>Checkout</h1>\n';
        html += '<div class="layout">\n';

        // col 1 - order summary
        html += '<div class="col1">\n';
        html += '<h2>Your Order</h2>\n';
        html += '<table>\n';
        html += '<tr><th>Item</th><th>Qty</th><th>Price</th></tr>\n';
        for (var i = 0; i < cart.items.length; i++) {
            var item = cart.items[i];
            html += '<tr><td>' + item.pizzaName + '<br><small style="color:#888">' + item.size + '</small></td>' +
                    '<td>' + item.quantity + '</td>' +
                    '<td>$' + item.itemTotal.toFixed(2) + '</td></tr>\n';
        }
        if (cart.discount > 0) {
            html += '<tr style="color:green"><td colspan="2">Discount (' + cart.promoCode + ')</td><td>-$' + cart.discount.toFixed(2) + '</td></tr>\n';
        }
        html += '<tr><td colspan="2">Tax (8.5%)</td><td>$' + cart.tax.toFixed(2) + '</td></tr>\n';
        html += '<tr><th colspan="2">Total</th><th style="color:#27ae60">$' + cart.total.toFixed(2) + '</th></tr>\n';
        html += '</table>\n';
        html += '<br><a href="/cart">&larr; Edit cart</a>\n';
        html += '</div>\n';

        // col 2 - checkout form
        html += '<div class="col2">\n';
        html += '<form action="/order/place" method="POST">\n';

        html += '<h2>Delivery Address</h2>\n';
        html += '<div class="form-group"><label>Street Address *</label><input type="text" name="street" required></div>\n';
        html += '<div class="form-group"><label>City *</label><input type="text" name="city" required></div>\n';
        html += '<div style="display:flex;gap:15px">\n';
        html += '  <div class="form-group" style="flex:1"><label>State *</label><input type="text" name="state" required maxlength="2" placeholder="NY"></div>\n';
        html += '  <div class="form-group" style="flex:2"><label>ZIP Code *</label><input type="text" name="zipCode" required pattern="[0-9]{5}" placeholder="10001"></div>\n';
        html += '</div>\n';
        html += '<div class="form-group"><label>Delivery Instructions</label><textarea name="instructions" rows="2" placeholder="Ring bell, leave at door, etc."></textarea></div>\n';

        html += '<h2>Payment Method</h2>\n';
        html += '<div class="payment-section">\n';
        html += '<div style="margin-bottom:12px">\n';
        html += '  <label style="display:inline;font-weight:normal">' +
                '<input type="radio" name="paymentMethod" value="card" checked onchange="togglePayment(this.value)"> ' +
                '&#128179; Credit / Debit Card</label>&nbsp;&nbsp;&nbsp;\n';
        html += '  <label style="display:inline;font-weight:normal">' +
                '<input type="radio" name="paymentMethod" value="paypal" onchange="togglePayment(this.value)"> ' +
                '&#128196; PayPal</label>\n';
        html += '</div>\n';

        // card fields
        html += '<div id="fields-card">\n';
        html += '  <div class="form-group"><label>Card Number</label>' +
                '<input type="text" name="cardNumber" placeholder="4111 1111 1111 1111" maxlength="19"></div>\n';
        html += '  <div class="form-group"><label>Name on Card</label>' +
                '<input type="text" name="cardName" placeholder="John Smith"></div>\n';
        html += '  <div style="display:flex;gap:15px">\n';
        html += '    <div class="form-group" style="flex:1"><label>Expiry (MM/YY)</label>' +
                '<input type="text" name="cardExpiry" placeholder="12/26" maxlength="5"></div>\n';
        html += '    <div class="form-group" style="flex:1"><label>CVV</label>' +
                '<input type="text" name="cardCvv" placeholder="123" maxlength="4"></div>\n';
        html += '  </div>\n';
        html += '  <p style="font-size:.8em;color:#888">Test cards: 4111111111111111 (success), ending 0000 (declined)</p>\n';
        html += '</div>\n';

        // paypal fields
        html += '<div id="fields-paypal" style="display:none">\n';
        html += '  <div class="form-group"><label>PayPal Email</label>' +
                '<input type="email" name="paypalEmail" placeholder="you@example.com"></div>\n';
        html += '  <p style="font-size:.8em;color:#888">Test: fail@example.com will be declined</p>\n';
        html += '</div>\n';

        html += '</div>\n'; // payment-section

        html += '<button type="submit" class="btn-place">&#9654; Place Order &mdash; $' + cart.total.toFixed(2) + '</button>\n';
        html += '</form>\n';
        html += '</div>\n'; // col2
        html += '</div>\n'; // layout

        html += '<script>\n' +
                'function togglePayment(method) {\n' +
                '  document.getElementById("fields-card").style.display   = method === "card"   ? "block" : "none";\n' +
                '  document.getElementById("fields-paypal").style.display = method === "paypal" ? "block" : "none";\n' +
                '}\n' +
                '</script>\n';

        html += pageFooter();
        res.send(html);
    });
});

// ============================================================
//  POST /order/place
//  THE PYRAMID OF DOOM - 8 levels of nested callbacks
//
//  Level 1: validate delivery address
//  Level 2: validate payment details
//  Level 3: load cart from DB
//  Level 4: load pizza documents (to check availability)
//  Level 5: process payment (async, fake gateway)
//  Level 6: save new Order document (fires Order.pre(save)!)
//  Level 7: remove the cart
//  Level 8: send confirmation email (fire-and-forget-ish)
// ============================================================
router.post('/place', function(req, res) {
    var sessionId = req.session.id;

    var rawAddress = {
        street:       req.body.street,
        city:         req.body.city,
        state:        req.body.state,
        zipCode:      req.body.zipCode,
        instructions: req.body.instructions || ''
    };

    var paymentMethod = req.body.paymentMethod || 'card';
    var rawPayment = {
        cardNumber:  req.body.cardNumber,
        cardName:    req.body.cardName,
        cardExpiry:  req.body.cardExpiry,
        cardCvv:     req.body.cardCvv,
        paypalEmail: req.body.paypalEmail
    };

    // ---- LEVEL 1: validate delivery address ----
    validators.validateAddress(rawAddress, function(addrErr, validAddress) {
        if (addrErr) {
            res.send(400,
                pageHeader('Invalid Address') +
                '<div class="error-box"><strong>Address problem:</strong> ' + addrErr.message + '</div>' +
                '<a href="/order/checkout">&larr; Go back and fix it</a>' +
                pageFooter());
            return;
        }

        // ---- LEVEL 2: validate payment info ----
        validators.validatePayment(paymentMethod, rawPayment, function(payErr, validPayment) {
            if (payErr) {
                res.send(400,
                    pageHeader('Invalid Payment') +
                    '<div class="error-box"><strong>Payment problem:</strong> ' + payErr.message + '</div>' +
                    '<a href="/order/checkout">&larr; Go back and fix it</a>' +
                    pageFooter());
                return;
            }

            // ---- LEVEL 3: load cart ----
            Cart.findOne({ sessionId: sessionId }, function(cartErr, cart) {
                if (cartErr) {
                    console.log('Cart load error in /order/place: ' + cartErr);
                    res.send(500, pageHeader('Error') + '<p>Error processing order, please try again.</p>' + pageFooter());
                    return;
                }

                if (!cart || cart.items.length === 0) {
                    res.send(400,
                        pageHeader('Empty Cart') +
                        '<div class="error-box">Your cart is empty.</div>' +
                        '<a href="/">Back to menu</a>' + pageFooter());
                    return;
                }

                // ---- LEVEL 4: load pizza documents, verify still available ----
                var pizzaIds = cart.items.map(function(item) { return item.pizzaId; });

                Pizza.find({ _id: { $in: pizzaIds } }, function(pizzaErr, pizzas) {
                    if (pizzaErr) {
                        console.log('Pizza.find error in /order/place: ' + pizzaErr);
                        res.send(500, pageHeader('Error') + '<p>Error loading menu items.</p>' + pageFooter());
                        return;
                    }

                    // build a quick lookup map: id -> pizza
                    var pizzaMap = {};
                    for (var pi = 0; pi < pizzas.length; pi++) {
                        pizzaMap[pizzas[pi]._id.toString()] = pizzas[pi];
                    }

                    // check every cart item is still available
                    var unavailable = [];
                    for (var ci = 0; ci < cart.items.length; ci++) {
                        var cItem  = cart.items[ci];
                        var dbPiza = pizzaMap[cItem.pizzaId.toString()];
                        if (!dbPiza || !dbPiza.isAvailable) {
                            unavailable.push(cItem.pizzaName);
                        }
                    }

                    if (unavailable.length > 0) {
                        res.send(400,
                            pageHeader('Items Unavailable') +
                            '<div class="error-box">The following items are no longer available: <strong>' +
                            unavailable.join(', ') + '</strong></div>' +
                            '<a href="/cart">Update your cart</a>' + pageFooter());
                        return;
                    }

                    // ---- LEVEL 5: process payment (fake gateway, ~500-1500ms) ----
                    payment.processPayment(paymentMethod, validPayment, cart.total, function(pmtErr, pmtResult) {
                        if (pmtErr) {
                            console.log('Payment failed for session ' + sessionId + ': ' + pmtErr.message);
                            res.send(402,
                                pageHeader('Payment Failed') +
                                '<div class="error-box"><strong>Payment failed:</strong> ' + pmtErr.message + '<br>' +
                                'No charge was made to your account.</div>' +
                                '<a href="/order/checkout">&larr; Try again</a>' + pageFooter());
                            return;
                        }

                        console.log('Payment approved: ' + pmtResult.transactionId + ' $' + cart.total);

                        // build order items array from cart
                        var orderItems = cart.items.map(function(item) {
                            return {
                                pizzaId:   item.pizzaId,
                                pizzaName: item.pizzaName,
                                size:      item.size,
                                quantity:  item.quantity,
                                unitPrice: item.unitPrice,
                                itemTotal: item.itemTotal
                            };
                        });

                        // ---- LEVEL 6: create and save order document ----
                        // Order.pre(save) will: generate order number, check duplicates,
                        // estimate delivery time, and update pizza stats
                        var order = new Order({
                            sessionId:       sessionId,
                            items:           orderItems,
                            deliveryAddress: validAddress,
                            payment: {
                                method:        paymentMethod,
                                last4:         pmtResult.last4         || null,
                                cardType:      pmtResult.cardType       || null,
                                paypalEmail:   pmtResult.paypalEmail    || null,
                                transactionId: pmtResult.transactionId,
                                amount:        cart.total,
                                processedAt:   pmtResult.processedAt,
                                status:        'approved'
                            },
                            subtotal:  cart.subtotal,
                            discount:  cart.discount,
                            tax:       cart.tax,
                            total:     cart.total,
                            promoCode: cart.promoCode || null,
                            status:    'confirmed'
                        });

                        order.save(function(orderErr, savedOrder) {
                            if (orderErr) {
                                // CRITICAL BUG: payment already charged but order not persisted
                                // no refund logic exists - customer needs to call us
                                console.log('CRITICAL: Order.save failed after payment charged!');
                                console.log('  TransactionId: ' + pmtResult.transactionId);
                                console.log('  Amount:        $' + cart.total);
                                console.log('  Error:         ' + orderErr);
                                res.send(500,
                                    pageHeader('Order Error') +
                                    '<div class="error-box">' +
                                    '<strong>Something went wrong saving your order.</strong><br>' +
                                    'Your payment of <strong>$' + cart.total.toFixed(2) + '</strong> was processed.<br>' +
                                    'Please call <strong>555-PIZZA</strong> with reference: <code>' +
                                    pmtResult.transactionId + '</code>' +
                                    '</div>' + pageFooter());
                                return;
                            }

                            console.log('Order saved: ' + savedOrder.orderNumber);

                            // ---- LEVEL 7: clear the cart ----
                            Cart.remove({ sessionId: sessionId }, function(removeErr) {
                                if (removeErr) {
                                    // non-fatal - cart will expire or be overwritten next time
                                    console.log('Cart.remove failed for session ' + sessionId + ': ' + removeErr);
                                }

                                // ---- LEVEL 8: send confirmation email ----
                                // fire-and-forget: don't fail the response if email breaks
                                sendConfirmationEmail(savedOrder, validAddress, function(emailErr) {
                                    if (emailErr) {
                                        console.log('Email failed for order ' + savedOrder.orderNumber + ': ' + emailErr);
                                        // TODO: queue for retry - for now it just gets lost
                                    }

                                    // stash in global in-memory map (app.js pattern)
                                    // memory leak if server runs long enough
                                    try {
                                        var appModule = require('../app');
                                        if (appModule.activeOrders) {
                                            appModule.activeOrders[savedOrder._id.toString()] = {
                                                orderNumber: savedOrder.orderNumber,
                                                status:      'confirmed',
                                                addedAt:     new Date()
                                            };
                                        }
                                    } catch (ignore) {
                                        // dont crash if app module is weird
                                    }

                                    res.redirect('/order/confirmation/' + savedOrder._id);
                                }); // end level 8
                            }); // end level 7
                        }); // end level 6
                    }); // end level 5
                }); // end level 4
            }); // end level 3
        }); // end level 2
    }); // end level 1
});

// ---- GET /order/confirmation/:id ----
router.get('/confirmation/:id', function(req, res) {
    Order.findById(req.params.id, function(err, order) {
        if (err || !order) {
            res.send(404, pageHeader('Not Found') + '<p>Order not found.</p><a href="/">Home</a>' + pageFooter());
            return;
        }

        var html = pageHeader('Order Confirmed!');
        html += '<div class="confirm-box">\n';
        html += '<h1 style="color:#155724;margin:0">&#10003; Order Confirmed!</h1>\n';
        html += '<p style="font-size:1.15em">Thank you! Your pizza is on its way.</p>\n';
        html += '<p><strong>Order Number: ' + order.orderNumber + '</strong></p>\n';
        html += '<p>Estimated delivery: <strong>' + order.estimatedDeliveryMinutes + ' minutes</strong></p>\n';
        html += '</div>\n';

        html += '<h2>Order Summary</h2>\n';
        html += '<table>\n<tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th></tr>\n';
        for (var i = 0; i < order.items.length; i++) {
            var item = order.items[i];
            html += '<tr><td>' + item.pizzaName + '</td><td>' + item.size + '</td><td>' +
                    item.quantity + '</td><td>$' + item.itemTotal.toFixed(2) + '</td></tr>\n';
        }
        if (order.discount > 0) {
            html += '<tr style="color:green"><td colspan="3">Discount (' + order.promoCode + ')</td><td>-$' + order.discount.toFixed(2) + '</td></tr>\n';
        }
        html += '<tr><td colspan="3">Tax</td><td>$' + order.tax.toFixed(2) + '</td></tr>\n';
        html += '<tr><th colspan="3">Total Charged</th><th style="color:#27ae60">$' + order.total.toFixed(2) + '</th></tr>\n';
        html += '</table>\n';

        html += '<h2>Delivering To</h2>\n';
        html += '<p>' + order.deliveryAddress.street + '<br>' +
                order.deliveryAddress.city + ', ' + order.deliveryAddress.state + ' ' +
                order.deliveryAddress.zipCode + '</p>\n';
        if (order.deliveryAddress.instructions) {
            html += '<p><em>Instructions: ' + order.deliveryAddress.instructions + '</em></p>\n';
        }

        html += '<h2>Payment</h2>\n';
        if (order.payment.method === 'card') {
            html += '<p>Charged to <strong>' + (order.payment.cardType || 'card') +
                    ' ending in ' + order.payment.last4 + '</strong></p>\n';
        } else {
            html += '<p>Paid via <strong>PayPal</strong> (' + order.payment.paypalEmail + ')</p>\n';
        }
        html += '<p style="color:#888;font-size:.88em">Transaction ID: ' + order.payment.transactionId + '</p>\n';

        html += '<br><a href="/" style="background:#c0392b;color:#fff;padding:10px 20px;text-decoration:none;border-radius:3px">Order Again</a>\n';
        html += '&nbsp;&nbsp;<a href="/order/history">View Order History</a>\n';

        html += pageFooter();
        res.send(html);
    });
});

// ---- GET /order/history ----
router.get('/history', function(req, res) {
    var sessionId = req.session.id;

    Order.find({ sessionId: sessionId }).sort('-createdAt').limit(20).exec(function(err, orders) {
        if (err) {
            console.log('Order history error: ' + err);
            res.send(500, pageHeader('Error') + '<p>Error loading order history</p>' + pageFooter());
            return;
        }

        var html = pageHeader('Order History');
        html += '<h1>Order History</h1>\n';

        if (orders.length === 0) {
            html += '<p>No previous orders found for this session.</p>\n<a href="/">Order now!</a>\n';
        } else {
            html += '<table>\n';
            html += '<tr><th>Order #</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr>\n';

            for (var i = 0; i < orders.length; i++) {
                var ord      = orders[i];
                var summary  = ord.items.map(function(it) { return it.pizzaName; }).join(', ');
                if (summary.length > 55) { summary = summary.substring(0, 52) + '...'; }

                var statusColor = ord.status === 'delivered' ? 'green' :
                                  ord.status === 'cancelled' ? 'red' : '#c0392b';

                html += '<tr>\n';
                html += '<td><strong>' + ord.orderNumber + '</strong></td>\n';
                html += '<td>' + ord.createdAt.toLocaleDateString() + ' ' +
                        ord.createdAt.toLocaleTimeString() + '</td>\n';
                html += '<td>' + summary + '</td>\n';
                html += '<td>$' + ord.total.toFixed(2) + '</td>\n';
                html += '<td style="color:' + statusColor + ';text-transform:capitalize">' + ord.status + '</td>\n';
                html += '<td><a href="/order/confirmation/' + ord._id + '">View</a></td>\n';
                html += '</tr>\n';
            }

            html += '</table>\n';
        }

        html += pageFooter();
        res.send(html);
    });
});

// ---- email helper ----
// lives here because "it was only needed in this file" - then it got copy-pasted to a cron job
// NOTE: nodemailer is installed but never wired up - just console.log for now
function sendConfirmationEmail(order, address, callback) {
    // TODO: wire up nodemailer transport
    //
    // var nodemailer = require('nodemailer');
    // var transport = nodemailer.createTransport('SMTP', { ... });
    // transport.sendMail({ ... });

    console.log('[EMAIL] Would send confirmation for order ' + order.orderNumber);
    console.log('[EMAIL]   To: session ' + order.sessionId);
    console.log('[EMAIL]   Deliver to: ' + address.street + ', ' + address.city);
    console.log('[EMAIL]   Total: $' + order.total);

    // pretend it's async
    process.nextTick(function() {
        callback(null);
    });
}

module.exports = router;
