// CategoryStat - stores per-category aggregates
// Updated by the Pizza pre-save hook (yes really, that is intentional)
var mongoose = require('mongoose');
var Schema   = mongoose.Schema;

var CategoryStatSchema = new Schema({
    category:     { type: String, unique: true },
    displayName:  String,
    count:        { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    lastUpdated:  Date
});

module.exports = mongoose.model('CategoryStat', CategoryStatSchema);
