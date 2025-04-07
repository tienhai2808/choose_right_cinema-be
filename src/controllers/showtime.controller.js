const ShowTime = require("../models/showtime.model");

module.exports.deleteAllShowTimes = async (req, res) => {
  try {
    await ShowTime.deleteMany({});
    res.status(200).json({ message: 'Deleted all showtimes' })
  } catch (err) {
    console.log(`Lỗi xóa toàn bộ showtime: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
}