const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const productController = require("../controllers/productController");
const categoryController = require("../controllers/categoryController");
const orderController = require("../controllers/orderController");
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/uploadMiddleware");
const discountController = require("../controllers/discountController");
const subscriptionController = require("../controllers/subscriptionController");
const searchController = require("../controllers/searchController");
const axios = require("axios");
const deliveryRouter = require("./deliveryRouter");
const favoritesRoutes = require("./favoritesRoutes");
const avatarUpload = require("../middleware/avatarUploadMiddleware");

// Auth routes
router.post("/auth/register", authController.register);
router.post("/auth/login", authController.login);
router.get("/auth/profile", authenticateToken, authController.getProfile);
router.put(
	"/auth/profile",
	authenticateToken,
	avatarUpload.single("avatar"),
	authController.updateProfile
);
router.get(
	"/auth/profile/full",
	authenticateToken,
	authController.getFullProfile
);
router.put(
	"/auth/profile/password",
	authenticateToken,
	authController.updatePassword
);

// Search routes
router.get("/products/search", searchController.searchProducts);
router.get("/products/top-searched", searchController.getTopSearchedProducts);
router.post(
	"/products/search-statistics",
	searchController.updateSearchStatistics
);
router.get(
	"/products/search/filters",
	searchController.searchProductsWithFilters
);

// Product routes
router.get("/products", productController.getProducts);
router.get("/products/:id", productController.getProductById);
router.post("/products", productController.createProduct);
router.get(
	"/products/:productId/purchase-status",
	authenticateToken,
	productController.checkPurchaseStatus
);
router.post("/products/byIds", productController.getProductsByIds);

// Review routes
router.post(
	"/products/:productId/reviews",
	authenticateToken,
	upload.array("mediaUrls"),
	productController.addReview
);
router.get("/products/:productId/reviews", productController.getReviews);
router.get(
	"/products/:productId/review-stats",
	productController.getProductReviewStats
);

// Category routes
router.get("/categories", categoryController.getCategories);
router.get("/categories/:id/products", categoryController.getCategoryProducts);

// Order routes
router.post("/checkout", authenticateToken, orderController.checkout);
router.put(
	"/orders/:orderId/status",
	authenticateToken,
	orderController.updateOrderStatus
);
router.get(
	"/orders/user-orders",
	authenticateToken,
	orderController.getUserOrders
);

// Subscription routes
router.post("/subscribe", subscriptionController.subscribe);

// Discount routes
router.get("/discount/regular", discountController.getDiscountedProducts);
router.get("/discount/11-11", discountController.getDiscountedProducts);

// Related products routes
router.get("/products/:id/related", productController.getRelatedProducts);

// Currency rates routes
router.get("/currency-rates", async (req, res) => {
	try {
		const response = await axios.get(
			"https://www.cbr-xml-daily.ru/daily_json.js"
		);
		res.json(response.data);
	} catch (error) {
		console.error("Ошибка при получении курсов валют:", error);
		res.status(500).json({ error: "Ошибка при получении курсов валют" });
	}
});

// Delivery routes
router.use("/delivery", deliveryRouter);

// Cart routes
router.post("/cart", authenticateToken, authController.saveCart);
router.get("/cart", authenticateToken, authController.loadCart);

// Favorites routes
router.use("/favorites", favoritesRoutes);

module.exports = router;
