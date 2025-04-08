const Film = require("../models/film.model");
const Cinema = require("../models/cinema.model");
const ShowTime = require("../models/showtime.model");
const { scrapeShowtimeImages, calculateDistances } = require("../utils/choose.util");

module.exports.chooseRightCinema = async (req, res) => {
  try {
    const { filmName, viewDate, location, radius, limit } = req.body;
    if (!filmName || !location || !radius) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin: filmName, location hoặc radius" });
    }
    if (!location.lat || !location.lng) {
      return res.status(400).json({ message: "Location phải có lat và lng" });
    }
    if (typeof radius !== "number" || radius <= 0) {
      return res.status(400).json({ message: "Radius phải là số dương" });
    }

    const filmQuery = {
      title: { $regex: new RegExp(filmName, "i") },
    };

    const film = await Film.findOne(filmQuery).lean();

    if (!film) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy phim khớp với tên" });
    }

    const cinemas = await Cinema.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [location.lng, location.lat],
          },
          $maxDistance: radius * 1000,
        },
      },
    })
      .limit(limit)
      .lean();

    if (!cinemas.length) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy rạp nào trong bán kính yêu cầu" });
    }

    const cinemasWithShowtime = [];
    for (const cinema of cinemas) {
      const checkShowTime = await ShowTime.findOne({
        film: film._id,
        cinema: cinema._id,
        date: viewDate,
      });
      if (checkShowTime) {
        cinemasWithShowtime.push(cinema);
      }
    }

    if (!cinemasWithShowtime.length) {
      return res.status(404).json({
        message: "Không tìm thấy rạp nào chiếu phim này vào ngày yêu cầu",
      });
    }

    const [showtimeImages, travelInfos] = await Promise.all([
      scrapeShowtimeImages(cinemasWithShowtime, viewDate, film),
      calculateDistances(cinemasWithShowtime, location),
    ]);

    const cinemasWithDistance = cinemasWithShowtime
      .map((cinema, index) => ({
        name: cinema.name,
        slug: cinema.slug,
        address: cinema.address,
        distance: travelInfos[index].distance,
        duration: travelInfos[index].duration,
        imgShowTime: showtimeImages[cinema.slug] || null,
      }))
      .sort((a, b) => a.distance - b.distance);

    res.status(200).json({
      message: "Các rạp phù hợp với bạn là:",
      data: cinemasWithDistance,
    });
  } catch (err) {
    console.log(`Lỗi chọn rạp: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};
