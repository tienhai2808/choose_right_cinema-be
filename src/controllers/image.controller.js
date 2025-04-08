const redis = require("redis");

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

module.exports.getShowTimeImage = async (req, res) => {
  const { redisImageKey } = req.params;
  try {
    if (!redisImageKey) {
      return res.status(400).json({ message: "Yêu cầu redisImageKey" });
    }

    const imageData = await redisClient.get(redisImageKey);

    if (!imageData) {
      return res.status(404).json({ message: "Không tìm thấy dữ liệu ảnh" });
    }

    const imageBuffer = Buffer.from(imageData, "base64");

    res.set("Content-Type", "image/webp");
    res.send(imageBuffer);
  } catch (err) {
    console.log(`Lỗi lấy redisImageKey: ${err.message}`);
    res.status(500).json({ message: "Internal server error" });
  }
}