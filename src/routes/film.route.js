const express = require("express");
const { deleteAllFilms } = require("../controllers/film.controller");

const router = express.Router();

router.delete("/all", deleteAllFilms);

module.exports = router;