const axios = require("axios");
const puppeteer = require("puppeteer");
const { Readable } = require("stream");

const Film = require("../models/film.model");
const Cinema = require("../models/cinema.model");
const ShowTime = require("../models/showtime.model");
const cloudinary = require("../config/cloudinary");

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

    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: null,
      args: ["--start-maximized"],
    });
    const page = await browser.newPage();

    const showtimeImages = {};

    for (const cinema of cinemasWithShowtime) {
      try {
        const url = `https://moveek.com/rap/${cinema.slug}/`;
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
        await new Promise((r) => setTimeout(r, 500));

        await page.$eval(`div[data-movie="${film.slug}"]`, (el) =>
          el.scrollIntoView()
        );
        await new Promise((r) => setTimeout(r, 500));

        const screenshotElement = await page.$(
          `div[data-movie="${film.slug}"]`
        );
        if (screenshotElement) {
          const closePopup = await page.$('a[data-dismiss="modal"]');
          try {
            await closePopup.click();
            await new Promise((r) => setTimeout(r, 500));
          } catch (err) {
            console.log("Không có popup che");
          }

          const imageBuffer = await screenshotElement.screenshot({
            encoding: "binary",
          });
          console.log(
            `Đã chụp ảnh phim ngày ${viewDate} tại rạp ${cinema.name}`
          );

          try {
            const uploadResponse = await new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  folder: "choose-cinema",
                  resource_type: "image",
                },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              const bufferStream = new Readable();
              bufferStream.push(imageBuffer);
              bufferStream.push(null);
              bufferStream.pipe(stream);
            });
            showtimeImages[cinema.slug] = uploadResponse.secure_url;
            console.log(`Đã upload ảnh lên Cloudinary: ${uploadResponse.secure_url}`);
          } catch (uploadErr) {
            console.log(`Lỗi upload ảnh cho rạp ${cinema.name}: ${uploadErr.message}`);
          }
        } else {
          console.log(
            `Không tìm thấy phần tử cần chụp ngày ${viewDate} tại rạp ${cinema.name}`
          );
        }
      } catch (err) {
        console.log(`Lỗi khi cào dữ liệu rạp ${cinema.name}: ${err.message}`);
      }
    }

    browser.close();

    const osrmPromises = cinemasWithShowtime.map(async (cinema) => {
      const url = `http://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${cinema.location.coordinates[0]},${cinema.location.coordinates[1]}?overview=false`;
      const response = await axios.get(url);
      const route = response.data.routes[0];
      return {
        distance: Math.round((route.distance / 1000) * 100) / 100,
        duration: Math.round((route.duration / 60) * 100) / 100,
      };
    });

    const travelInfos = await Promise.all(osrmPromises);
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
