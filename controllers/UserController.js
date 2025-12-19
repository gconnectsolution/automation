const userModel = require('../model/UserModel.js');

const userDetails = async(req,res)=>{
    try{
        const {name,email,address,website,category,score,isInterested} = req.body
        const user = new userModel({
            name,
            email,
            address,
            website,
            category,
            score,
            isInterested
        })
        await user.save()
        res.status(201).json(user)
    }catch(e){
        console.log('there is an error' , e.message)
        res.status(500).json({message: 'server error'})
    }
}

module.exports = {userDetails}