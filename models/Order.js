const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

const OrderItemSchema = new Schema({
    pizzaId:   Schema.Types.ObjectId,
    pizzaName: String,
    size:      String,
    quantity:  Number,
    unitPrice: Number,
    itemTotal: Number
});

const DeliveryAddressSchema = new Schema({
    street:       String,
    city:         String,
    state:        String,
    zipCode:      String,
    instructions: String
});

const PaymentDetailsSchema = new Schema({
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

const OrderSchema = new Schema({
    orderNumber:              { type: String, unique: true },
    sessionId:                String,
    items:                    [OrderItemSchema],
    deliveryAddress:          DeliveryAddressSchema,
    payment:                  PaymentDetailsSchema,
    subtotal:                 Number,
    happyHourDiscount:        { type: Number, default: 0 },
    discount:                 { type: Number, default: 0 },
    tax:                      Number,
    total:                    Number,
    promoCode:                String,
    status:                   { type: String, default: 'pending' },
    estimatedDeliveryMinutes: { type: Number, default: 45 },
    notes:                    String,
    createdAt:                { type: Date, default: Date.now },
    updatedAt:                { type: Date, default: Date.now }
});

OrderSchema.index({ sessionId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });

// No pre-save hook — all business logic lives in OrderService.
OrderSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Order', OrderSchema);
