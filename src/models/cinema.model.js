const mongoose = require("mongoose");

const cinemaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    address: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        default: "Point",
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        required: true,
      }
    },
    city: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

cinemaSchema.index({ location: "2dsphere" });

const Cinema = mongoose.model("Cinema", cinemaSchema);

module.exports = Cinema;
