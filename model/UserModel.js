const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true }, // Ensure we don't duplicate emails
    address: String,
    website: String,
    category: String,
    score: Number,
    priority_level: String,
    status: {
        type: String,
        enum: ['RAW', 'SENT', 'INTERESTED', 'NOT_INTERESTED', 'EMAIL_FAILED'],
        default: 'RAW'
    },
    interestedAt: Date, // Timestamp for when they clicked
}, { timestamps: true });

module.exports = mongoose.model('UserModel', leadSchema);