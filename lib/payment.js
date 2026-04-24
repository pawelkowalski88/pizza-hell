// Fake payment gateway module
// IMPORTANT: no real money is processed here - this is ALL simulated
// Real gateway integration is "in the backlog" since 2014

var uuid = require('node-uuid');

function getCardType(cardNumber) {
    if (/^4/.test(cardNumber))       return 'visa';
    if (/^5[1-5]/.test(cardNumber))  return 'mastercard';
    if (/^3[47]/.test(cardNumber))   return 'amex';
    if (/^6(?:011|5)/.test(cardNumber)) return 'discover';
    return 'unknown';
}

function processCardPayment(paymentData, amount, callback) {
    var cardNumber = paymentData.cardNumber;
    var cardType   = getCardType(cardNumber);
    var last4      = cardNumber.slice(-4);

    console.log('Processing card payment: ' + cardType + ' **** ' + last4 + ' amount=$' + amount);

    // simulate gateway round-trip
    setTimeout(function() {
        // test card numbers for demo/testing
        if (last4 === '0000') {
            callback(new Error('Card declined by issuing bank'));
            return;
        }
        if (last4 === '1111') {
            callback(new Error('Insufficient funds'));
            return;
        }
        if (last4 === '2222') {
            callback(new Error('Card reported lost or stolen'));
            return;
        }

        var transactionId = 'CC-' + uuid.v4().toUpperCase().replace(/-/g, '').substring(0, 16);

        callback(null, {
            success:       true,
            transactionId: transactionId,
            last4:         last4,
            cardType:      cardType,
            amount:        amount,
            currency:      'USD',
            processedAt:   new Date(),
            authCode:      '' + Math.floor(100000 + Math.random() * 900000)
        });

    }, 400 + Math.floor(Math.random() * 600)); // 400-1000 ms fake latency
}

function processPaypalPayment(paymentData, amount, callback) {
    var paypalEmail = paymentData.paypalEmail;

    console.log('Processing PayPal payment for ' + paypalEmail + ' amount=$' + amount);

    setTimeout(function() {
        // test accounts
        if (paypalEmail === 'fail@example.com') {
            callback(new Error('PayPal transaction was declined'));
            return;
        }
        if (paypalEmail === 'frozen@example.com') {
            callback(new Error('This PayPal account is temporarily limited'));
            return;
        }

        var transactionId = 'PP-' + uuid.v4().toUpperCase().replace(/-/g, '').substring(0, 16);

        callback(null, {
            success:       true,
            transactionId: transactionId,
            paypalEmail:   paypalEmail,
            payerId:       'PYPL' + Math.floor(10000000 + Math.random() * 90000000),
            amount:        amount,
            currency:      'USD',
            processedAt:   new Date()
        });

    }, 700 + Math.floor(Math.random() * 800)); // paypal is always slower
}

function processPayment(method, paymentData, amount, callback) {
    if (method === 'card') {
        processCardPayment(paymentData, amount, callback);
    } else if (method === 'paypal') {
        processPaypalPayment(paymentData, amount, callback);
    } else {
        process.nextTick(function() {
            callback(new Error('Unknown payment method: ' + method));
        });
    }
}

module.exports = {
    processPayment:        processPayment,
    processCardPayment:    processCardPayment,
    processPaypalPayment:  processPaypalPayment
};
