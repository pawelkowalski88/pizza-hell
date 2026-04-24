// Order model
// WARNING: pre-save hook does ORDER NUMBER GENERATION, DUPLICATE DETECTION,
//          DELIVERY TIME ESTIMATION and PIZZA STATS UPDATES
// Dave said "it keeps things in one place" - 2013

var mongoose = require('mongoose');
var Schema   = mongoose.Schema;

var OrderItemSchema = new Schema({
    pizzaId:   Schema.Types.ObjectId,
    pizzaName: String,
    size:      String,
    quantity:  Number,
    unitPrice: Number,
    itemTotal: Number
});

var DeliveryAddressSchema = new Schema({
    street:       String,
    city:         String,
    state:        String,
    zipCode:      String,
    instructions: String
});

var PaymentDetailsSchema = new Schema({
    method:        String,  // card | paypal
    last4:         String,
    cardType:      String,
    paypalEmail:   String,
    transactionId: String,
    amount:        Number,
    currency:      { type: String, default: 'USD' },
    processedAt:   Date,
    status:        String
});

var OrderSchema = new Schema({
    orderNumber:              { type: String, unique: true },
    sessionId:                String,
    items:                    [OrderItemSchema],
    deliveryAddress:          DeliveryAddressSchema,
    payment:                  PaymentDetailsSchema,
    subtotal:                 Number,
    discount:                 Number,
    tax:                      Number,
    total:                    Number,
    promoCode:                String,
    status:                   { type: String, default: 'pending' },
    estimatedDeliveryMinutes: { type: Number, default: 45 },
    notes:                    String,
    createdAt:                { type: Date, default: Date.now },
    updatedAt:                { type: Date, default: Date.now }
});

// -----------------------------------------------------------------------
// PRE-SAVE: four jobs in one hook
//   1. generate order number (with a race condition)
//   2. detect potential duplicates (logs but doesn't block)
//   3. estimate delivery time
//   4. increment totalOrders on each Pizza (which triggers Pizza.pre(save)!)
// -----------------------------------------------------------------------
OrderSchema.pre('save', function(next) {
    var order = this;
    order.updatedAt = new Date();

    if (!order.isNew) {
        // status updates go straight through
        next();
        return;
    }

    // STEP 1 - generate order number using COUNT (race condition if 2 orders come in together)
    Order.count({}, function(err, count) {
        if (err) {
            // fallback: timestamp-based number - guaranteed unique but ugly
            order.orderNumber = 'ORD-FALLBACK-' + Date.now();
            console.log('Order.count failed, using fallback order number');
            checkForDuplicates();
            return;
        }

        var year = new Date().getFullYear();
        var seq  = count + 1001;  // start from 1001 so it looks like we have orders
        order.orderNumber = 'ORD-' + year + '-' + seq;

        checkForDuplicates();
    });

    // STEP 2 - duplicate detection: same session placed an order in the last 5 minutes?
    function checkForDuplicates() {
        var fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        Order.findOne({
            sessionId: order.sessionId,
            createdAt: { $gte: fiveMinutesAgo },
            status:    { $ne: 'cancelled' }
        }, function(err, existing) {
            if (err) {
                console.log('Duplicate check error: ' + err);
                estimateDeliveryTime();
                return;
            }
            if (existing && existing._id.toString() !== order._id.toString()) {
                console.log('WARN: possible duplicate order from session ' + order.sessionId +
                    ' (previous: ' + existing.orderNumber + ')');
                // TODO: actually block duplicates but customers complained it was too aggressive
            }
            estimateDeliveryTime();
        });
    }

    // STEP 3 - estimate delivery based on how backed up the kitchen is right now
    function estimateDeliveryTime() {
        Order.count({ status: { $in: ['pending', 'confirmed', 'preparing'] } }, function(err, activeCount) {
            if (err) {
                order.estimatedDeliveryMinutes = 45;
            } else {
                // 30 min base + 5 min per 3 active orders, capped at 90
                var extra = Math.floor(activeCount / 3) * 5;
                order.estimatedDeliveryMinutes = Math.min(30 + extra, 90);
            }
            updatePizzaStats();
        });
    }

    // STEP 4 - increment totalOrders on every pizza in this order
    // this calls pizza.save() which fires Pizza.pre(save) which updates CategoryStat
    // so placing one order can trigger: 1 Order save + N Pizza saves + N CategoryStat saves
    function updatePizzaStats() {
        var Pizza    = require('./Pizza');
        var idx      = 0;
        var items    = order.items;

        function processNext() {
            if (idx >= items.length) {
                next();
                return;
            }
            var item = items[idx];
            idx++;

            Pizza.findById(item.pizzaId, function(err, pizza) {
                if (err || !pizza) {
                    console.log('Could not load pizza ' + item.pizzaId + ' for stat update');
                    processNext();
                    return;
                }

                pizza.totalOrders  += item.quantity;
                pizza.lastOrderDate = new Date();

                pizza.save(function(saveErr) {
                    if (saveErr) {
                        console.log('Pizza stat save failed: ' + saveErr);
                    }
                    processNext();
                });
            });
        }

        processNext();
    }
});

var Order = mongoose.model('Order', OrderSchema);
module.exports = Order;
