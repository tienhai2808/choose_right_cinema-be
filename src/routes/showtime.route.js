const express = require('express');

const { deleteAllShowTimes } = require('../controllers/showtime.controller');

const router = express.Router();

router.delete("/all", deleteAllShowTimes);

module.exports = router;