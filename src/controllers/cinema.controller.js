const Cinema = require("../models/cinema.model");

module.exports.deleteAllCinemas = async (req, res) => {
  try {
    await Cinema.deleteMany({});
    res.status(200).json({ message: "Deleted all cinemas" });
  } catch (err) {
    console.log(`Lỗi xóa toàn bộ rạp: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getAllCinemas = async (req, res) => {
  try {
    const cinemas = await Cinema.find({});
    res.status(200).json(cinemas);
  } catch (err) {
    console.log(`Lỗi lấy dữ liệu tất cả các rạp: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
}
