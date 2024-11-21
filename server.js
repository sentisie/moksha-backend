const express = require("express");
const cors = require("cors");
const createUserDirectories = require('./utils/createDirectories');
const cleanupTempFiles = require('./utils/cleanupTempFiles');

require("dotenv").config();

const app = express();
const apiRoutes = require("./routes/api");

const corsOptions = {
	origin: "http://localhost:3000",
	credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/uploads", express.static("uploads"));

app.use("/api", apiRoutes);

app.get("/", (req, res) => {
	res.send("Server is running");
});

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "http://localhost:3000");
	res.header("Access-Control-Allow-Credentials", "true");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

createUserDirectories();

setInterval(cleanupTempFiles, 6 * 60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
	console.log(`Server is running on address: "http://localhost:${PORT}"`);
});
