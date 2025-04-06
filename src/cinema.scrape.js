const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const redis = require("redis");

const Cinema = require("./models/cinema.model");
// const Film = require("./models/film.model");
const scrapeUtil = require("./utils/scrape.util");

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
  const cinemasInDB = await Cinema.find({}, "slug");
  const pipeline = redisClient.multi();
  for (const cinema of cinemasInDB) {
    const redisKey = `cinema:${cinema.slug}`;
    pipeline.setEx(redisKey, 86400, "true"); 
  }
  await pipeline.exec();
  console.log(`Đã load ${cinemasInDB.length} rạp từ MongoDB vào Redis`);
})();

const scrapeData = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();

  const url = "https://moveek.com/";

  await page.goto(url, { waitUntil: "networkidle2" });
  const cityList = [
    // "Tp. Hồ Chí Minh",
    // "Hà Nội",
    // "Đà Nẵng",
    // "Đồng Nai",
    "Cần Thơ",
    "Bình Dương",
    "Bình Phước",
    "Bình Thuận",
    "Bà Rịa - Vũng Tàu",
    "An Giang",
    "Bến Tre",
    "Kiên Giang",
    "Hải Phòng",
    "Hải Dương",
    "Trà Vinh",
    "Quảng Ninh",
    "Bắc Giang",
    "Vĩnh Long",
    "Cà Mau",
    "Ninh Bình",
    "Lào Cai",
    "Phú Thọ",
    "Hậu Giang",
    "Thái Bình",
    "Khánh Hòa",
    "Tây Ninh",
    "Thái Nguyên",
    "Bạc Liêu",
    "Thừa Thiên - Huế",
    "Đồng Tháp",
    "Sóc Trăng",
    "Bình Định",
    "Hưng Yên",
    "Thanh Hóa",
    "Hà Tĩnh",
    "Đắk Lắk",
    "Yên Bái",
    "Long An",
    "Nghệ An",
    "Tiền Giang",
    "Bắc Ninh",
    "Lâm Đồng",
    "Hòa Bình",
    "Tuyên Quang",
    "Nam Định",
    "Sơn La",
    "Phú Yên",
    "Quảng Bình",
    "Quảng Trị",
    "Quảng Nam",
    "Lạng Sơn",
    "Quảng Ngãi",
    "Ninh Thuận",
    "Hà Nam",
    "Vĩnh Phúc",
    "Gia Lai",
    "Kon Tum",
  ];

  try {
    await page.click('a[href="/rap/"]');
    console.log('Đã ấn vào thẻ a[href="/rap/"]');

    await new Promise((r) => setTimeout(r, 1500));

    for (let i = 0; i < cityList.length; i++) {
      await page.click(".select2-selection.select2-selection--single");

      await new Promise((r) => setTimeout(r, 1000));

      const cityElements = await page.$$(".select2-results ul li");
      for (const element of cityElements) {
        const text = await page.evaluate((el) => el.textContent, element);
        if (text.includes(cityList[i])) {
          await element.click();
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 1000));

      const cinemaElements = await page.$$(".border-bottom.region-item");
      for (const element of cinemaElements) {
        const aCinema = await element.$(".card-title.mb-1 a");

        const pathCinema = await page.evaluate(
          (el) => el.getAttribute("href"),
          aCinema
        );
        const slug = pathCinema.split("/")[2];
        const hrefCinema = await page.evaluate((el) => el.href, aCinema);

        const cinemaPage = await page.browser().newPage();
        await cinemaPage.goto(hrefCinema, { waitUntil: "networkidle2" });

        const name = await cinemaPage.$eval("h1.mb-0", (el) =>
          el.textContent.trim()
        );
        const address = await cinemaPage.$eval(
          "p.mb-0.small.text-muted.text-truncate",
          (el) => el.textContent.trim()
        );
        const city = await cinemaPage.$eval(
          "a.text-muted.ml-3.d-none.d-sm-inline-block",
          (el) => el.textContent.trim()
        );

        const redisKeyCinema = `cinema:${slug}`;
        const cachedCinema = await redisClient.get(redisKeyCinema);
        let cinemaExists = false;

        if (cachedCinema) {
          console.log(`Rạp đã tồn tại trong Redis: ${name}`);
          cinemaExists = true;
        } else {
          const existingCinema = await Cinema.findOne({ slug: slug });
          if (existingCinema) {
            console.log(`Rạp đã tồn tại trong DB, thêm vào Redis: ${name}`);
            await redisClient.setEx(redisKeyCinema, 86400, "true");
            cinemaExists = true;
          }
        }

        // const films = await cinemaPage.$$eval(
        //   "#showtimes .card.card-sm.mb-3",
        //   (elements) => {
        //     const extractDurations = (str) => {
        //       const match = str.match(/(\d+)h(\d+)'?/);
        //       if (!match) return null;
        //       const hours = parseInt(match[1], 10);
        //       const minutes = parseInt(match[2], 10);
        //       return hours * 60 + minutes;
        //     };

        //     return elements.map(element => {
        //       const a = element.querySelector('h4.card-title.mb-1.name a');
        //       const description = element.querySelector('p.card-text.small.text-muted.mb-0')?.textContent.trim();
        //       return {
        //         title: a?.textContent.trim(),
        //         slug: a?.getAttribute('href').split('/')[2],
        //         image: element.querySelector('.rounded.img-fluid').src,
        //         duration: extractDurations(description),
        //       }
        //     })
        //   }
        // );

        // for (const film of films) {
        //   if (!film.title || !film.slug || !film.image || !film.duration) {
        //     console.log(`Dữ liệu phim không đầy đủ, bỏ qua: ${film.title}`);
        //     continue;
        //   }

        //   const redisKeyFilm = `film:${film.slug}`;
        //   const cachedFilm = await redisClient.get(redisKeyFilm);

        //   if (cachedFilm) {
        //     console.log(`Phim đã tồn tại trong Redis, bỏ qua: ${film.title}`);
        //     continue;
        //   }

        //   const existingFilm = await Film.findOne({ slug: film.slug });
        //   if (!existingFilm) {
        //     const newFilm = new Film({
        //       title: film.title,
        //       slug: film.slug,
        //       image: film.image, 
        //       duration: film.duration,
        //     });
        //     await newFilm.save();
        //     console.log(`Đã lưu phim mới: ${film.title}`);

        //     await redisClient.setEx(redisKeyFilm, 86400, "true");
        //   } else {
        //     console.log(`Phim đã tồn tại trong DB, thêm vào Redis: ${film.title}`);
        //     await redisClient.setEx(redisKeyFilm, 86400, "true");
        //   }
        // }

        if (!cinemaExists) {
          const aLocation = await cinemaPage.$("a.text-muted.flex-");
          let hrefLocation = await cinemaPage.evaluate(
            (el) => el.href,
            aLocation
          );
  
          if (name === "Đống Đa") {
            hrefLocation = "https://maps.google.com/?q=Rạp Đống Đa";
          } else if (name === "Viện Trao Đổi Văn Hóa Pháp – L’Espace") {
            hrefLocation = "https://maps.google.com/?q=Tràng Tiền Plaza";
          }
          
          const locationPage = await cinemaPage.browser().newPage();
          await locationPage.goto(hrefLocation, { waitUntil: "networkidle2" });
          await new Promise((r) => setTimeout(r, 1000));
  
          const locationUrl = locationPage.url();
          const location = scrapeUtil.extractLatLngFromGoogleMapsUrl(locationUrl);
  
          if (location) {
            const newCinema = new Cinema({
              name,
              slug,
              address,
              location,
              city,
            });

            await newCinema.save();
            console.log(`Đã lưu rạp: ${name}`);
            await redisClient.setEx(redisKeyCinema, 86400, "true");
          }
          await locationPage.close();
        }
        await cinemaPage.close();

        await new Promise((r) => setTimeout(r, 1000));
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    await new Promise((r) => setTimeout(r, 1000));
  } catch (err) {
    console.error("Error while scraping:", err);
  } finally {
    await browser.close();
    if (redisConnected) await redisClient.quit();
    await mongoose.connection.close();
  }
};

scrapeData();
