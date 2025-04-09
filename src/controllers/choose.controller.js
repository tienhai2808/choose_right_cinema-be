const redis = require("redis")

const Film = require("../models/film.model");
const Cinema = require("../models/cinema.model");
const ShowTime = require("../models/showtime.model");
const {
  scrapeShowtimeImages,
  calculateDistances,
  getGeminiRecommendation,
  testGemini,
} = require("../utils/choose.util");

const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

(async () => {
  redisClient.on("error", (err) => {
    console.log("Redis client error", err);
  });

  redisClient.on("ready", () => {
    console.log("Redis client started");
  });

  await redisClient.connect();

  await redisClient.ping();
})();

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

    // const cinemasWithDistance = cinemasWithShowtime
    //   .map((cinema, index) => ({
    //     name: cinema.name,
    //     slug: cinema.slug,
    //     address: cinema.address,
    //     distance: travelInfos[index].distance,
    //     duration: travelInfos[index].duration,
    //     imgShowTime: `http://localhost:2808/api/images/showtime/${showtimeImages[cinema.slug]}` || null,
    //   }))
    //   .sort((a, b) => a.distance - b.distance);

    const cinemasWithDistance = await Promise.all(
      cinemasWithShowtime.map(async (cinema, index) => {
        const redisKey = showtimeImages[cinema.slug];
        const base64Image = redisKey ? await redisClient.get(redisKey) : null;
        return {
          name: cinema.name,
          slug: cinema.slug,
          address: cinema.address,
          distance: travelInfos[index].distance,
          duration: travelInfos[index].duration,
          imgShowTime: redisKey
            ? `http://localhost:2808/api/images/showtime/${redisKey}`
            : null,
            base64Image: base64Image ? `data:image/webp;base64,${base64Image}` : null,
        };
      })
    ).then((results) => results.sort((a, b) => a.distance - b.distance));

    const geminiResponse = await getGeminiRecommendation(
      cinemasWithDistance,
      filmName,
      viewDate
    );

    const cinemasForResponse = cinemasWithDistance.map(cinema => ({
      name: cinema.name,
      slug: cinema.slug,
      address: cinema.address,
      distance: cinema.distance,
      duration: cinema.duration,
      imgShowTime: cinema.imgShowTime,
    }));

    res.status(200).json({
      message: "Các rạp phù hợp với bạn là:",
      data: cinemasForResponse,
      recommendedCinema: geminiResponse,
    });
  } catch (err) {
    console.log(`Lỗi chọn rạp: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};