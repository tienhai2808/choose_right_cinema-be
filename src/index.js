const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

const connectDB = require('./config/db');
const cinemaRoutes = require('./routes/cinema.route');
const filmRoutes = require('./routes/film.route');
const chooseRoutes = require('./routes/choose.route');
const showTimeRoutes = require('./routes/showtime.route')

dotenv.config();
const PORT = process.env.PORT;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}))

app.use("/api/choose", chooseRoutes);
app.use("/api/cinemas", cinemaRoutes);
app.use("/api/films", filmRoutes);
app.use("/api/showtimes", showTimeRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
});