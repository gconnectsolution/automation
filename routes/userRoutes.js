const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');

router.get('/interested/:id', userController.interestedUser);
router.get('/not-interested/:id', userController.notInterestedUser);

module.exports = router;