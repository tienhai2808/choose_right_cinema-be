const express = require('express');

const { chooseRightCinema } = require('../controllers/choose.controller');

const router = express.Router();

router.post("/", chooseRightCinema);

module.exports = router;