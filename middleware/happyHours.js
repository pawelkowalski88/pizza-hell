const HappyHour = require('../models/HappyHour');

module.exports = async function happyHoursMiddleware(req, res, next) {
    try {
        res.locals.happyHour = await HappyHour.getActive() || null;
    } catch (err) {
        console.error('happyHours middleware error:', err.message);
        res.locals.happyHour = null;
    }
    next();
};
