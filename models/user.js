const mongoose = require("mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/miniproject");

const userSchema = mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    age: {
        type: Number,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    profilepic: {
        type: String,
        default: "default.jpg"
    },
    posts: [
        { type: mongoose.Schema.Types.ObjectId, ref: "post" }
    ],
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    messages: [{
        friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        lastMessage: { type: String },
        timestamp: { type: Date },
        unseenCount: { type: Number, default: 0 }
    }]
});

module.exports = mongoose.model("user", userSchema);