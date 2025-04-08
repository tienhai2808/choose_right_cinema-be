const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const redis = require("redis");

const Cinema = require("./models/cinema.model");
const { getNextSixDays, extractLatLngFromGoogleMapsUrl } = require("./utils/scrape.util");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Kết nối MongoDB thành công!"))
  .catch((err) => console.error("Lỗi kết nối MongoDB:", err));

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
    "Tp. Hồ Chí Minh",
    "Hà Nội",
    "Đà Nẵng",
    "Đồng Nai",
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
    console.log('Đã ấn vào Rạp');

    await new Promise((r) => setTimeout(r, 1500));

    for (let i = 0; i < cityList.length; i++) {
      try {
        await page.click(".select2-selection.select2-selection--single");
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.log(`Không thể ấn vào danh sách tỉnh thành: ${err.message}`);
      }

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

        const redisCinemaKey = `cinema:${slug}`;
        const cachedCinema = await redisClient.get(redisCinemaKey);

        if (cachedCinema) {
          console.log(`Rạp đã tồn tại trong Redis với slug: ${slug} và bỏ qua`);
          continue;
        }

        const existingCinema = await Cinema.findOne({ slug: slug });
        if (existingCinema) {
          console.log(`Rạp đã tồn tại trong DB, thêm vào Redis với slug: ${slug} và bỏ qua`);
          await redisClient.setEx(redisCinemaKey, 86400, "true");
          continue;
        }

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
        const location = extractLatLngFromGoogleMapsUrl(locationUrl);

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
          await redisClient.setEx(redisCinemaKey, 86400, "true");
        }
        await locationPage.close();
        
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
    await redisClient.quit();
    await mongoose.connection.close();
  }
};

scrapeData();
