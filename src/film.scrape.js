const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const Film = require("./models/film.model");
const Cinema = require("./models/cinema.model");
const scrapeUtil = require("./utils/scrape.util");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Kết nối MongoDB thành công!"))
  .catch((err) => console.error("Lỗi kết nối MongoDB:", err));

const scrapeData = async () => {
  const cinemas = await Cinema.find({ city: { $in: ["Tp. Hồ Chí Minh", "Hà Nội"]} });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();

  for (const cinema of cinemas) {
    const url = `https://moveek.com/rap/${cinema.slug}/`;
    try {
      await page.goto(url, { waitUntil: "networkidle2" });
      const dateList = scrapeUtil.getNextSixDays();
      for (const date of dateList) {
        const dateSelector = `a[data-date="${date}"]`
        const dateElement = await page.$(dateSelector);
        if (!dateElement) {
          console.log(
            `Không tìm thấy lịch chiếu ngày ${viewDate} tại rạp ${cinema.name}`
          );
          continue;
        }
        
        await dateElement.click();

        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      console.log(`Lỗi khi thông tin rạp ${cinema.name}: ${err.message}`);
    }
  }

  await browser.close();
  await mongoose.connection.close();
};

scrapeData();


