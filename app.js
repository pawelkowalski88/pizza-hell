// PizzaLand Online Ordering System
// Written by Dave, June 2013
// "Quick prototype" that became production
//
// IMPORTANT: dont move the seed function - it has to run after mongoose connects
// IMPORTANT: dont change the session secret without migrating sessions first
// TODO: split this into separate files when we have time
// TODO: add proper logging (has been TODO since July 2013)
//
// 2024 note: bumped Express 3->4 and Mongoose 3->5 to get it running on Node 25
// used mongodb-memory-server because nobody set up a real Mongo instance
// ALL the route/model code is original and untouched

var express      = require('express');
var mongoose     = require('mongoose');
var http         = require('http');
var path         = require('path');
var bodyParser   = require('body-parser');
var cookieParser = require('cookie-parser');
var session      = require('express-session');
var MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;

// =====================================================
// GLOBAL STATE
// yes this is terrible - Dave knows
// but the order confirmation page needs it to show live status
// "we'll move to Redis when we scale" - 2013
// =====================================================
var activeOrders  = {};   // orderId -> { orderNumber, status, addedAt }
var lastError     = null; // last uncaught error, shown on /admin/stats
var appStartTime  = new Date();

// export early so circular requires in routes don't race
module.exports.activeOrders = activeOrders;

// =====================================================
// BOOT: start in-memory MongoDB, then start Express
// (original code assumed a local mongod was running)
// =====================================================
console.log('Starting in-memory MongoDB...');
console.log('(First run downloads the binary - may take a minute)');

MongoMemoryServer.create().then(function(mongod) {
    var mongoUri = mongod.getUri();
    console.log('MongoDB ready: ' + mongoUri);

    // =====================================================
    // DATABASE CONNECTION
    // =====================================================
    mongoose.connect(mongoUri, {
        useNewUrlParser:    true,
        useUnifiedTopology: true,
        useFindAndModify:   false
    });

    var db = mongoose.connection;

    db.on('error', function(err) {
        console.log('!!!!!!!!!!!!!!!!!!!!!!');
        console.log('!! DATABASE ERROR   !!');
        console.log('!!!!!!!!!!!!!!!!!!!!!!');
        console.log(err);
        lastError = err;
        // TODO: alert Dave by email when this happens
    });

    db.once('open', function() {
        console.log('Mongoose connection open');

        // seed menu if the collection is empty
        var Pizza = require('./models/Pizza');
        Pizza.count({}, function(err, count) {
            if (err) {
                console.log('Pizza.count error during startup: ' + err);
                return;
            }
            if (count === 0) {
                console.log('Empty menu - seeding pizza catalogue...');
                seedDatabase(function(seedErr) {
                    if (seedErr) {
                        console.log('Seeding failed: ' + seedErr);
                    } else {
                        console.log('Seeding complete');
                    }
                });
            } else {
                console.log('Menu has ' + count + ' pizzas - no seeding needed');
            }
        });
    });

    // =====================================================
    // EXPRESS SETUP
    // Originally Express 3 with app.configure() blocks.
    // app.configure() was removed in Express 4 so it's
    // inlined here now. Nothing else changed.
    // =====================================================
    var app = express();

    app.set('port', process.env.PORT || 3000);

    // Express 4: bodyParser, cookieParser, session are separate packages now
    // Express 3 had them bundled as express.bodyParser() etc.
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(session({
        secret:            'p1zz4s3cr3t_changethisbeforeprod',
        name:              'pizzaland.sid',
        resave:            true,
        saveUninitialized: true,
        cookie:            { maxAge: 2 * 60 * 60 * 1000 }  // 2 hours
    }));
    app.use(express.static(path.join(__dirname, 'public')));

    // =====================================================
    // ROUTES
    // =====================================================
    app.use('/',       require('./routes/menu'));
    app.use('/cart',   require('./routes/cart'));
    app.use('/order',  require('./routes/orders'));

    // admin stats - no auth because "its on an internal port" (it isnt)
    app.get('/admin/stats', function(req, res) {
        var Pizza = require('./models/Pizza');
        var Order = require('./models/Order');
        var Cart  = require('./models/Cart');

        // three separate sequential DB calls because aggregation seemed complicated
        Pizza.count({}, function(err, pizzaCount) {
            if (err) { res.status(500).send('DB error'); return; }

            Order.count({}, function(err, orderCount) {
                if (err) { res.status(500).send('DB error'); return; }

                Cart.count({}, function(err, cartCount) {
                    if (err) { res.status(500).send('DB error'); return; }

                    Order.find({}).sort('-createdAt').limit(10).exec(function(err, recentOrders) {
                        if (err) { res.status(500).send('DB error'); return; }

                        var html = '<html><head><title>PizzaLand Admin</title></head><body>';
                        html += '<h1>PizzaLand Admin Stats</h1>';
                        html += '<p>Server started: ' + appStartTime + '</p>';
                        html += '<p>Pizzas in menu: <strong>' + pizzaCount + '</strong></p>';
                        html += '<p>Total orders: <strong>' + orderCount + '</strong></p>';
                        html += '<p>Active carts: <strong>' + cartCount + '</strong></p>';
                        html += '<p>In-memory active orders: <strong>' + Object.keys(activeOrders).length + '</strong></p>';
                        if (lastError) {
                            html += '<p style="color:red"><strong>Last error:</strong> ' + lastError + '</p>';
                        }
                        html += '<h2>Last 10 Orders</h2><ul>';
                        for (var i = 0; i < recentOrders.length; i++) {
                            var o = recentOrders[i];
                            html += '<li>' + o.orderNumber + ' &mdash; $' + o.total +
                                    ' &mdash; <em>' + o.status + '</em>' +
                                    ' &mdash; ' + o.createdAt.toLocaleString() + '</li>';
                        }
                        html += '</ul></body></html>';
                        res.send(html);
                    });
                });
            });
        });
    });

    // 404
    app.use(function(req, res) {
        res.status(404).send('<h1>404 &mdash; Page not found</h1><a href="/">Go home</a>');
    });

    // error handler - shows stack trace (yes, even in prod, Dave "never got around to fixing it")
    app.use(function(err, req, res, next) {
        console.log('Unhandled error: ' + err.stack);
        lastError = err;
        res.status(500).send(
            '<h1>Something broke</h1>' +
            '<pre style="background:#f8f8f8;padding:15px;border:1px solid #ddd">' + err.stack + '</pre>' +
            '<a href="/">Go home</a>');
    });

    // =====================================================
    // START SERVER
    // =====================================================
    http.createServer(app).listen(app.get('port'), function() {
        console.log('');
        console.log('  PizzaLand Online Ordering');
        console.log('  http://localhost:' + app.get('port'));
        console.log('');
    });

}).catch(function(err) {
    console.log('Failed to start MongoDB: ' + err);
    process.exit(1);
});

// =====================================================
// SEED DATA
// Saves pizzas one at a time with recursive callbacks
// because insertMany wasnt in Mongoose 3.x and Dave
// "didnt want to mess with async" (npm install async, 2013)
// =====================================================
function seedDatabase(callback) {
    var Pizza = require('./models/Pizza');

    var pizzaData = [
        // CLASSIC
        {
            name: 'Margherita', category: 'classic',
            description: 'Tomato sauce, fresh mozzarella, fresh basil',
            basePrice: 11.99, toppings: ['tomato sauce', 'mozzarella', 'fresh basil'],
            isAvailable: true, rating: 4.5, ratingCount: 128
        },
        {
            name: 'Marinara', category: 'classic',
            description: 'Tomato sauce, garlic, oregano - no cheese, very traditional',
            basePrice: 9.99, toppings: ['tomato sauce', 'garlic', 'oregano'],
            isAvailable: true, rating: 4.2, ratingCount: 67
        },
        {
            name: 'Quattro Formaggi', category: 'classic',
            description: 'Four-cheese blend: mozzarella, gorgonzola, fontina, parmesan',
            basePrice: 14.99, toppings: ['mozzarella', 'gorgonzola', 'fontina', 'parmesan'],
            isAvailable: true, rating: 4.7, ratingCount: 203
        },
        {
            name: 'Napolitana', category: 'classic',
            description: 'Tomato sauce, mozzarella, anchovies, capers, black olives',
            basePrice: 13.99, toppings: ['tomato sauce', 'mozzarella', 'anchovies', 'capers', 'black olives'],
            isAvailable: true, rating: 4.3, ratingCount: 89
        },
        // SPECIALTY
        {
            name: 'BBQ Chicken', category: 'specialty',
            description: 'BBQ sauce, grilled chicken, red onion, cilantro',
            basePrice: 15.99, toppings: ['bbq sauce', 'grilled chicken', 'red onion', 'cilantro', 'mozzarella'],
            isAvailable: true, rating: 4.6, ratingCount: 312
        },
        {
            name: 'Hawaiian Dream', category: 'specialty',
            description: 'Tomato sauce, mozzarella, ham, pineapple',
            basePrice: 13.99, toppings: ['tomato sauce', 'mozzarella', 'ham', 'pineapple'],
            isAvailable: true, rating: 3.8, ratingCount: 445
        },
        {
            name: 'Truffle Mushroom', category: 'specialty',
            description: 'White sauce, truffle oil, mixed mushrooms, rocket',
            basePrice: 18.99, toppings: ['white sauce', 'truffle oil', 'porcini', 'cremini', 'rocket'],
            isAvailable: true, rating: 4.8, ratingCount: 156
        },
        {
            name: 'The Inferno', category: 'specialty',
            description: 'Spicy tomato sauce, pepperoni, fresh jalapenos, chilli flakes',
            basePrice: 14.99, toppings: ['spicy tomato sauce', 'pepperoni', 'jalapenos', 'chilli flakes', 'mozzarella'],
            isAvailable: true, rating: 4.4, ratingCount: 278
        },
        // VEGETARIAN
        {
            name: 'Garden Delight', category: 'vegetarian',
            description: 'Pesto base, roasted vegetables, goat cheese',
            basePrice: 13.99, toppings: ['pesto', 'zucchini', 'bell peppers', 'cherry tomatoes', 'goat cheese'],
            isAvailable: true, rating: 4.5, ratingCount: 134
        },
        {
            name: 'Spinach & Feta', category: 'vegetarian',
            description: 'Olive oil base, wilted spinach, feta, olives, sun-dried tomatoes',
            basePrice: 13.99, toppings: ['olive oil', 'spinach', 'feta', 'black olives', 'sun-dried tomatoes'],
            isAvailable: true, rating: 4.6, ratingCount: 189
        },
        {
            name: 'Roasted Veggie Supreme', category: 'vegetarian',
            description: 'Tomato sauce, mozzarella, seasonal roasted vegetables',
            basePrice: 14.99, toppings: ['tomato sauce', 'mozzarella', 'eggplant', 'zucchini', 'red onion', 'bell peppers'],
            isAvailable: true, rating: 4.4, ratingCount: 201
        },
        // MEAT LOVERS
        {
            name: 'Pepperoni Classic', category: 'meat',
            description: 'Tomato sauce, extra mozzarella, double pepperoni',
            basePrice: 15.99, toppings: ['tomato sauce', 'mozzarella', 'pepperoni'],
            isAvailable: true, rating: 4.7, ratingCount: 567
        },
        {
            name: 'Meat Supreme', category: 'meat',
            description: 'Everything meat: pepperoni, sausage, ham, bacon',
            basePrice: 18.99, toppings: ['tomato sauce', 'mozzarella', 'pepperoni', 'italian sausage', 'ham', 'bacon'],
            isAvailable: true, rating: 4.6, ratingCount: 423
        },
        {
            name: 'Bacon & Sausage Blast', category: 'meat',
            description: 'Cream sauce, mozzarella, bacon, Italian sausage, caramelised onions',
            basePrice: 17.99, toppings: ['cream sauce', 'mozzarella', 'bacon', 'italian sausage', 'caramelised onions'],
            isAvailable: true, rating: 4.5, ratingCount: 298
        }
    ];

    var idx = 0;

    // save one at a time with a recursive callback
    // because nobody knew about Promise.all in 2013
    function saveNext() {
        if (idx >= pizzaData.length) {
            callback(null);
            return;
        }

        var data = pizzaData[idx];
        idx++;

        var doc = new Pizza(data);
        doc.save(function(err) {
            if (err) {
                console.log('Seed: failed to save "' + data.name + '": ' + err.message);
                // keep going - partial menu is better than no menu
            }
            saveNext();
        });
    }

    saveNext();
}
