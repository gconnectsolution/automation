const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const userModel = require('../model/UserModel');

router.post('/add-user', userController.userDetails)

module.exports = router;