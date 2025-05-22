const express = require("express");

const { deleteAllFilms, getFilms } = require("../controllers/film.controller");

const router = express.Router();

router.get("/", getFilms);

router.delete("/all", deleteAllFilms);

module.exports = router;