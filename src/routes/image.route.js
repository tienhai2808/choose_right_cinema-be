const express = require("express");

const { getShowTimeImage } = require("../controllers/image.controller");

const router = express.Router();

router.get("/showtime/:redisImageKey", getShowTimeImage);

module.exports = router;