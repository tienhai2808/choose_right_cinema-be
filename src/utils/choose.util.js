const puppeteer = require("puppeteer");
const axios = require("axios");
const redis = require("redis");
const sharp = require("sharp");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
dotenv.config();

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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
          showtimeImages[cinema.slug] = redisImageKey;
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

module.exports.getGeminiRecommendation = async (cinemas, film, date) => {
  const currentTime = new Date().toLocaleString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `
  Tôi đang tìm rạp chiếu phim tốt nhất để xem phim "${film}" vào ngày ${date}. 
  Thời gian hiện tại là ${currentTime}. 
  Dưới đây là danh sách các rạp gần tôi, kèm theo thông tin khoảng cách, thời gian di chuyển và ảnh suất chiếu tại ngày ${date}. 
  Trong ảnh suất chiếu, các suất nhạt màu là các suất đã chiếu (trước thời gian hiện tại), hãy bỏ qua chúng và chỉ phân tích các suất chiếu chưa diễn ra (sau thời gian hiện tại). 
  Hãy phân tích và gợi ý rạp tốt nhất dựa trên các yếu tố sau:
  - Khoảng cách gần.
  - Thời gian di chuyển ngắn.
  - Suất chiếu phù hợp (ưu tiên suất chiếu sớm nhất sau thời gian hiện tại).
  - Nếu TẤT CẢ các rạp đều có thông tin giá vé trong ảnh (ví dụ: 88K, 20K), hãy thêm tiêu chí giá vé vào phân tích (ưu tiên giá rẻ hơn). Nếu có rạp nào không hiển thị giá vé, bỏ qua tiêu chí giá vé.

  Danh sách rạp:
  ${cinemas
    .map(
      (cinema, index) => `
    Rạp ${index + 1}: 
    - Tên: ${cinema.name}
    - Địa chỉ: ${cinema.address}
    - Khoảng cách: ${cinema.distance} km
    - Thời gian di chuyển: ${cinema.duration} phút
    - Ảnh suất chiếu: (xem ảnh đính kèm)
  `
    )
    .join("\n")}

  Trả về tên rạp được chọn và lý do chi tiết.
`;

  const requestData = [
    { text: prompt },
    ...cinemas
      .filter((cinema) => cinema.base64Image)
      .map((cinema) => ({
        inlineData: {
          data: cinema.base64Image.split(",")[1],
          mimeType: "image/webp",
        },
      })),
  ];

  const result = await model.generateContent(requestData);
  const response = result.response.text();

  return response;
};
