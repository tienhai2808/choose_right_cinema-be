const puppeteer = require("puppeteer");
const fs = require("fs");

const scrapeData = async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const allProducts = [];
  let currentPage = 1;
  const maxPages = 13;

  while (currentPage <= maxPages) {
    const url = `https://icondenim.com/collections/tat-ca-san-pham?page=${currentPage}`;

    await page.goto(url);

    const products = await page.evaluate(() => {
      const productElements = document.querySelectorAll(".product-block.item");
      return Array.from(productElements).map((product) => {
        const image1 = product.querySelector(
          ".product-img.has-hover a .img-first"
        ).src;
        const image2 = product.querySelector(
          ".product-img.has-hover a .img-hover"
        ).src;
        const title = product
          .querySelector(".product-detail .pro-name a")
          .getAttribute("title");
        const price = product
          .querySelector(".product-detail .box-pro-prices .pro-price span")
          .textContent.trim();
        const colors = Array.from(
          product.querySelectorAll(
            ".product-detail .select-color .list-variants-img li span"
          )
        ).map((span) => {
          const title = span.getAttribute("title");
          const parts = title.split("-");
          const firstPart = parts[0].trim();
          return firstPart;
        });
        const link = product.querySelector(".product-detail .pro-name a").href;
        return {
          image1,
          image2,
          title,
          price,
          colors,
          link,
        };
      });
    });

    allProducts.push(...products);
    console.log(`Đã lấy dữ liệu từ trang ${currentPage}`);
    currentPage++;
  }

  fs.writeFileSync("products.json", JSON.stringify(allProducts, null, 2), {
    encoding: "utf-8",
  });

  console.log("Dữ liệu đã được lưu vào file products.json");

  await browser.close();
};

scrapeData();
