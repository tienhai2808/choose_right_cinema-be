const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB đã được kết nối: ${conn.connection.host}`)
  } catch (err) {
    console.log(`MongDB chưa được kết nối: ${err}`)
  }
}

module.exports = connectDB;