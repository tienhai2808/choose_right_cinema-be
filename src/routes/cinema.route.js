const express = require('express');
const { deleteAllCinemas, getAllCinemas } = require('../controllers/cinema.controller');

const router = express.Router();

router.delete("/all", deleteAllCinemas);
router.get("/all", getAllCinemas);

module.exports = router;