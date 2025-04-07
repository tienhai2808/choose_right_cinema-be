const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const redis = require("redis");

const Film = require("./models/film.model");
const Cinema = require("./models/cinema.model");
const scrapeUtil = require("./utils/scrape.util");
const ShowTime = require("./models/showtime.model");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Kết nối MongoDB thành công!"))
  .catch((err) => console.error("Lỗi kết nối MongoDB:", err));

const redisClient = redis.createClient();

(async () => {
  redisClient.on("error", (err) => {
    console.log("Redis client error", err);
  });
  redisClient.on("ready", () => {
    console.log("Redis client started");
  });

  await redisClient.connect();
  await redisClient.ping();

  console.log("Đang đồng bộ dữ liệu từ MongoDB vào Redis...");
  const filmsInDB = await Film.find({});
  const today = scrapeUtil.getNextSixDays()[0];
  const showTimesInDB = await ShowTime.find({ date: { $gte: today } }).populate(
    [
      {
        path: "film",
        select: "slug",
      },
      {
        path: "cinema",
        select: "slug",
      },
    ]
  );
  const pipeline = redisClient.multi();
  for (const film of filmsInDB) {
    const redisKey = `film:${film.slug}`;
    const filmData = JSON.stringify({
      id: film._id.toString(),
      title: film.title,
      slug: film.slug,
    });
    pipeline.setEx(redisKey, 172800, filmData);
  }
  for (const showtime of showTimesInDB) {
    const redisKey = `showtime:${showtime.date.toISOString().split("T")[0]}_${
      showtime.film.slug
    }_${showtime.cinema.slug}`;
    pipeline.setEx(redisKey, 172800, "true");
  }
  await pipeline.exec();
  console.log(
    `Đã load ${filmsInDB.length} phim và ${showTimesInDB.length} showtime từ MongoDB vào Redis`
  );
})();

const scrapeData = async () => {
  const cinemas = await Cinema.find({});

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();

  try {
    for (const cinema of cinemas) {
      const url = `https://moveek.com/rap/${cinema.slug}/`;

      await page.goto(url, { waitUntil: "networkidle2" });
      const dateList = scrapeUtil.getNextSixDays();
      for (const date of dateList) {
        const dateSelector = `a[data-date="${date}"]`;
        const dateElement = await page.$(dateSelector);
        if (!dateElement) {
          console.log(
            `Không tìm thấy lịch chiếu ngày ${viewDate} tại rạp ${cinema.name}`
          );
          continue;
        }

        await dateElement.click();
        console.log(`Đã click vào ngày ${date}`);

        await new Promise((r) => setTimeout(r, 1000));

        const films = await page.$$eval("div[data-movie-id]", (els) => {
          const extractDurations = (str) => {
            const match = str.match(/(\d+)h(\d+)'?/);
            if (!match) return null;
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            return hours * 60 + minutes;
          };
          return els.map((el) => {
            const aTitleFilm = el.querySelector("h4.card-title.mb-1.name a");
            const description = el
              .querySelector("p.card-text.small.text-muted.mb-0")
              ?.textContent.trim();
            return {
              title: aTitleFilm?.textContent.trim(),
              slug: aTitleFilm?.getAttribute("href").split("/")[2],
              image: el.querySelector(".rounded.img-fluid").src,
              duration: extractDurations(description),
            };
          });
        });

        for (const film of films) {
          if (!film.title || !film.slug || !film.image || !film.duration) {
            console.log(`Dữ liệu phim không đầy đủ, bỏ qua: ${film.title}`);
            continue;
          }

          const redisFilmKey = `film:${film.slug}`;
          const cachedFilm = await redisClient.get(redisFilmKey);
          let existingFilm;

          if (cachedFilm) {
            existingFilm = JSON.parse(cachedFilm);
            console.log(`Phim ${film.title} lấy từ Redis`);
          } else {
            existingFilm = await Film.findOne({ slug: film.slug });
            if (!existingFilm) {
              const newFilm = new Film({
                title: film.title,
                slug: film.slug,
                image: film.image,
                duration: film.duration,
              });
              existingFilm = await newFilm.save();
              console.log(`Đã thêm mới phim ${film.title}`);
            } else {
              console.log(
                `Phim ${film.title} chưa có trong Redis nhưng có trong DB`
              );
            }
            const filmData = JSON.stringify({
              id: existingFilm._id.toString(),
              title: existingFilm.title,
              slug: existingFilm.slug,
            });
            await redisClient.setEx(redisFilmKey, 172800, filmData);
            console.log(`Đã cập nhật phim ${film.title} vào Redis`);
          }

          const redisShowTimeKey = `showtime:${date}_${existingFilm.slug}_${cinema.slug}`;
          const cachedShowTime = await redisClient.get(redisShowTimeKey);

          if (cachedShowTime) {
            console.log(
              `Showtime đã tồn tại trong redis, bỏ qua ngày ${date} phim ${existingFilm.title} rạp ${cinema.name}`
            );
            continue;
          }

          const existingShowTime = await ShowTime.findOne({
            film: existingFilm.id,
            cinema: cinema.id,
            date,
          });
          if (!existingShowTime) {
            const newShowTime = new ShowTime({
              film: existingFilm.id,
              cinema: cinema.id,
              date,
            });
            await newShowTime.save();
            console.log(
              `Đã lưu showtime mới: ngày ${date} phim ${existingFilm.title} rạp ${cinema.name}`
            );
          } else {
            console.log(
              `Showtime ngày ${date} phim ${existingFilm.title} rạp ${cinema.name} chưa có trong redis nhưng có trong DB`
            );
          }
          await redisClient.setEx(redisShowTimeKey, 172800, "true");
          console.log(
            `Đã cập nhật showtime ngày ${date} phim ${existingFilm.title} rạp ${cinema.name} vào Redis`
          );
        }
      }
    }
  } catch (err) {
    console.error("Lỗi khi scrape");
  } finally {
    await browser.close();
    await redisClient.quit();
    await mongoose.connection.close();
  }
};

scrapeData();
