const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

const HappyHourSchema = new Schema({
    name:                  { type: String, required: true },
    days:                  [{ type: Number, min: 0, max: 6 }], // 0=Sun … 6=Sat
    startHour:             { type: Number, required: true, min: 0, max: 23 },
    endHour:               { type: Number, required: true, min: 1, max: 24 },
    discountPercent:       { type: Number, required: true, min: 1, max: 99 },
    applicableCategories:  { type: [String], default: ['all'] }, // ['all'] or specific categories
    isActive:              { type: Boolean, default: true },
    createdAt:             { type: Date, default: Date.now }
});

// Returns the first currently-active happy hour (if any)
HappyHourSchema.statics.getActive = async function() {
    const now  = new Date();
    const day  = now.getDay();   // 0-6
    const hour = now.getHours(); // 0-23
    return this.findOne({
        isActive:  true,
        days:      day,
        startHour: { $lte: hour },
        endHour:   { $gt:  hour }
    });
};

module.exports = mongoose.model('HappyHour', HappyHourSchema);
