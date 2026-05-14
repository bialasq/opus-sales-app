// backend/server.js
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfiguracja Multer do przesyłania plików
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Utwórz folder uploads jeśli nie istnieje
const fs = require("fs");
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Routes
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/products", require("./routes/products"));
app.use("/api/payments", require("./routes/payments"));

// Upload endpoint
app.post("/api/upload", upload.single("file"), (req, res) => {
  res.json({
    message: "Plik przesłany pomyślnie",
    filename: req.file.filename,
  });
});

app.listen(PORT, () => {
  console.log(`Server działa na porcie ${PORT}`);
});
