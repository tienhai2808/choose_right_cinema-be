const express = require("express");

const { deleteAllFilms, getAllFilms } = require("../controllers/film.controller");

const router = express.Router();

router.get("/all", getAllFilms);

router.delete("/all", deleteAllFilms);

module.exports = router;