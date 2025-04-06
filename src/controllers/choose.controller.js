const axios = require("axios");
const puppeteer = require("puppeteer");

const Film = require("../models/film.model");
const Cinema = require("../models/cinema.model");

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

    const osrmPromises = cinemas.map(async (cinema) => {
      const url = `http://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${cinema.location.coordinates[0]},${cinema.location.coordinates[1]}?overview=false`;
      const response = await axios.get(url);
      const route = response.data.routes[0];
      return {
        distance: Math.round((route.distance / 1000) * 100) / 100,
        duration: Math.round((route.duration / 60) * 100) / 100,
      };
    });

    const travelInfos = await Promise.all(osrmPromises);

    const cinemasWithDistance = cinemas.map((cinema, index) => ({
      name: cinema.name,
      slug: cinema.slug,
      address: cinema.address,
      distance: travelInfos[index].distance,
      duration: travelInfos[index].duration,
    }));

    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: null,
      args: ["--start-maximized"],
    });
    const page = await browser.newPage();
    const cinemasWithShowtime = []; 
    for (const cinema of cinemasWithDistance) {
      const url = `https://moveek.com/rap/${cinema.slug}/`;
      try {
        await page.goto(url, { waitUntil: "networkidle2" });

        const dateSelector = `a[data-date="${viewDate}"]`;
        const dateElement = await page.$(dateSelector);
        if (!dateElement) {
          console.log(
            `Không tìm thấy lịch chiếu ngày ${viewDate} tại rạp ${cinema.name}`
          );
          continue;
        }
        await dateElement.click();
        await new Promise((r) => setTimeout(r, 1500));

        const movieSelector = `[data-movie="${film.slug}"]`;
        const movieExists = await page.$(movieSelector);

        if (movieExists) {
          console.log(
            `Phim ${film.title} ở rạp ${cinema.name} ngày ${viewDate} CÓ chiếu`
          );
          cinemasWithShowtime.push(cinema);
        } else {
          console.log(
            `Phim ${film.title} ở rạp ${cinema.name} ngày ${viewDate} KHÔNG chiếu`
          );
        }
      } catch (err) {
        console.log(`Lỗi khi kiểm tra rạp ${cinema.name}: ${err.message}`);
      }
    }

    await browser.close();

    if (!cinemasWithShowtime.length) {
      return res.status(404).json({
        message: "Không tìm thấy rạp nào chiếu phim này vào ngày yêu cầu",
      });
    }

    res.status(200).json({
      message: "Các rạp phù hợp với bạn là:",
      data: cinemasWithShowtime,
    });
  } catch (err) {
    console.log(`Lỗi chọn rạp: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
};
