const Film = require("../models/film.model");

module.exports.deleteAllFilms = async (req, res) => {
  try {
    await Film.deleteMany({});
    res.status(200).json({ message: "Deleted all films" });
  } catch (err) {
    console.log(`Lỗi xóa toàn bộ phim: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getAllFilms = async (req, res) => {
  try {
    const films = await Film.find({});
    res.status(200).json(films);
  } catch (err) {
    console.log(`Lỗi lấy danh sách phim: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};
