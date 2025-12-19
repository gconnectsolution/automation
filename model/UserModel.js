const mongoose = require('mongoose');

const userIntrestedSchema = new mongoose.Schema({
    //name,email,website,category,address,final_score,priority_level,status
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true
    },
    address:{
        type:String,
        required:true,
    },
    website:{
        type:String,
        required:true,
    },
    category:{
        type:String,
        required:true,
    },
    score:{
        type:Number,
        required:true,
    },
    isInterested:{
        type:Boolean,
        default:false,
    }

});

module.exports = mongoose.model('UserModel' , userIntrestedSchema);