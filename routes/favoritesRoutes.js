const express = require("express");
const router = express.Router();
const favoriteController = require("../controllers/favoriteController");
const authenticateToken = require("../middleware/auth");

router.get("/", authenticateToken, favoriteController.getFavorites);
router.post("/", authenticateToken, favoriteController.addFavorite);
router.delete(
	"/:productId",
	authenticateToken,
	favoriteController.removeFavorite
);

module.exports = router;
