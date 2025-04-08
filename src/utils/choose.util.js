const puppeteer = require("puppeteer");
const axios = require("axios");
const redis = require("redis");
const sharp = require("sharp");

const cloudinary = require("../config/cloudinary");

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

module.exports.scrapeShowtimeImages = async (cinemas, date, film) => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();

  const showtimeImages = {};

  const requestId = `showtime-image:${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  for (const cinema of cinemas) {
    try {
      const url = `https://moveek.com/rap/${cinema.slug}/`;
      await page.goto(url, { waitUntil: "networkidle2" });
      const dateSelector = `a[data-date="${date}"]`;
      const dateElement = await page.$(dateSelector);
      if (!dateElement) {
        console.log(
          `Không tìm thấy lịch chiếu ngày ${date} tại rạp ${cinema.name}`
        );
        continue;
      }

      await dateElement.click();
      await new Promise((r) => setTimeout(r, 500));

      await page.$eval(`div[data-movie="${film.slug}"]`, (el) =>
        el.scrollIntoView()
      );
      await new Promise((r) => setTimeout(r, 500));

      const screenshotElement = await page.$(`div[data-movie="${film.slug}"]`);
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
          type: "webp",
        });
        console.log(`Đã chụp ảnh phim ngày ${date} tại rạp ${cinema.name}`);

        try {
          const processedImage = await sharp(imageBuffer).webp().toBuffer();

          const base64String = processedImage.toString("base64");
          const redisImageKey = `${requestId}:image:${cinema.slug}`;

          await redisClient.setEx(redisImageKey, 300, base64String);
          console.log(`Đã lưu ảnh vào redis với key là: ${redisImageKey}`);
          showtimeImages[cinema.slug] = `http://localhost:2808/api/images/showtime/${redisImageKey}`;
        } catch (uploadErr) {
          console.log(
            `Lỗi upload ảnh cho rạp ${cinema.name}: ${uploadErr.message}`
          );
        }
      } else {
        console.log(
          `Không tìm thấy phần tử cần chụp ngày ${date} tại rạp ${cinema.name}`
        );
      }
    } catch (err) {
      console.log(`Lỗi khi cào dữ liệu rạp ${cinema.name}: ${err.message}`);
    }
  }

  browser.close();
  return showtimeImages;
};

module.exports.calculateDistances = (cinemas, location) => {
  const osrmPromises = cinemas.map(async (cinema) => {
    const url = `http://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${cinema.location.coordinates[0]},${cinema.location.coordinates[1]}?overview=false`;
    const response = await axios.get(url);
    const route = response.data.routes[0];
    return {
      distance: Math.round((route.distance / 1000) * 100) / 100,
      duration: Math.round((route.duration / 60) * 100) / 100,
    };
  });

  return Promise.all(osrmPromises);
};
