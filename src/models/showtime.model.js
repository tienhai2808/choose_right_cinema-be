const mongoose = require("mongoose");

const showTimeSchema = new mongoose.Schema(
  {
    cinema: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cinema",
      required: true,
    },
    film: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Film",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

const ShowTime = mongoose.model("ShowTime", showTimeSchema);

module.exports = ShowTime;
