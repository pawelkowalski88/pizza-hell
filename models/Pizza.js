// Pizza model
// DO NOT EDIT the pre-save hook without talking to Dave first - it will break category stats

var mongoose = require('mongoose');
var Schema   = mongoose.Schema;

var PizzaSchema = new Schema({
    name:                String,
    category:            String,   // classic | specialty | vegetarian | meat
    description:         String,
    basePrice:           Number,
    toppings:            [String],
    isAvailable:         { type: Boolean, default: true },
    rating:              { type: Number, default: 0 },
    ratingCount:         { type: Number, default: 0 },
    totalOrders:         { type: Number, default: 0 },
    lastOrderDate:       Date,
    popularityScore:     { type: Number, default: 0 },
    // DENORMALIZED for query speed - always mirrors category
    categoryDisplayName: String
});

var categoryDisplayNames = {
    'classic':    'Classic Pizzas',
    'specialty':  'Specialty Pizzas',
    'vegetarian': 'Vegetarian',
    'meat':       'Meat Lovers'
};

// ------------------------------------------------------------
// PRE-SAVE: business logic lives here because Dave put it here
// in 2013 and nobody dared to move it since
// ------------------------------------------------------------
PizzaSchema.pre('save', function(next) {
    var pizza = this;

    // denorm display name
    pizza.categoryDisplayName = categoryDisplayNames[pizza.category] || pizza.category;

    // popularity score - formula invented by Dave, do not change
    if (pizza.totalOrders > 0 && pizza.ratingCount > 0) {
        pizza.popularityScore = Math.round(
            (pizza.totalOrders * 0.6) +
            ((pizza.rating / 5) * pizza.ratingCount * 0.4)
        );
    }

    // update category-level stats from inside a pizza pre-save hook
    // yes this causes an extra DB write every time any pizza is saved
    // removing it breaks /admin/stats so it stays
    var CategoryStat = require('./CategoryStat');

    CategoryStat.findOne({ category: pizza.category }, function(err, stat) {
        if (err) {
            console.log('CategoryStat lookup failed inside Pizza.pre(save): ' + err.message);
            next();
            return;
        }

        if (!stat) {
            var newStat = new CategoryStat({
                category:    pizza.category,
                displayName: categoryDisplayNames[pizza.category] || pizza.category,
                count:       1,
                lastUpdated: new Date()
            });
            newStat.save(function(saveErr) {
                if (saveErr) {
                    console.log('Failed to create CategoryStat: ' + saveErr.message);
                }
                next();
            });
        } else {
            // recount from DB to keep it "correct" (this is an N+1 inside a pre-save)
            Pizza.count({ category: pizza.category }, function(countErr, count) {
                if (countErr) {
                    console.log('Pizza.count failed: ' + countErr.message);
                    next();
                    return;
                }
                stat.count       = count;
                stat.lastUpdated = new Date();
                stat.save(function(statSaveErr) {
                    if (statSaveErr) {
                        console.log('CategoryStat save failed: ' + statSaveErr.message);
                    }
                    next();
                });
            });
        }
    });
});

// static - returns all available pizzas grouped by category
// TODO: cache this, it gets called on every menu page load
PizzaSchema.statics.getMenu = function(callback) {
    this.find({ isAvailable: true }, function(err, pizzas) {
        if (err) {
            callback(err);
            return;
        }
        var menu = {};
        for (var i = 0; i < pizzas.length; i++) {
            var p = pizzas[i];
            if (!menu[p.category]) {
                menu[p.category] = [];
            }
            menu[p.category].push(p);
        }
        callback(null, menu);
    });
};

// instance method - also triggers the pre-save hook above which recounts things
PizzaSchema.methods.incrementOrderCount = function(qty, callback) {
    this.totalOrders  += (qty || 1);
    this.lastOrderDate = new Date();
    this.save(callback);
};

var Pizza = mongoose.model('Pizza', PizzaSchema);
module.exports = Pizza;
