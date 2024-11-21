const pool = require("../db");
const { formatProductWithDiscount } = require("../utils/productUtils");
const { cloudinary } = require('../config/cloudinary');

const getProducts = async (req, res) => {
	try {
		const { limit = 18, offset = 0, sort = "id", exclude } = req.query;

		let query = `
			SELECT p.*, 
				COALESCE(AVG(r.rating), 0) as avg_rating,
				d.id as discount_id,
				d.type as discount_type,
				d.percentage as discount_percentage,
				d.start_date as discount_start_date,
				d.end_date as discount_end_date
			FROM products p
			LEFT JOIN reviews r ON p.id = r.product_id
			LEFT JOIN product_discounts pd ON p.id = pd.product_id
			LEFT JOIN discounts d ON pd.discount_id = d.id
			GROUP BY p.id, d.id, d.type, d.percentage, d.start_date, d.end_date
		`;

		if (sort === "rating") {
			query += ` HAVING COALESCE(AVG(r.rating), 0) >= 4 ORDER BY avg_rating DESC`;
		} else if (sort === "purchases") {
			query += ` ORDER BY p.purchases DESC`;
		} else {
			query += ` ORDER BY p.id ASC`;
		}

		query += " LIMIT $" + 1;
		query += " OFFSET $" + 2;

		const queryParams = [limit, offset];

		const result = await pool.query(query, queryParams);

		const productsWithDiscounts = result.rows.map(formatProductWithDiscount);

		res.json(productsWithDiscounts);
	} catch (error) {
		console.error("Ошибка при получении продуктов:", error);
		res.status(500).json({ error: "Ошибка при получении продуктов" });
	}
};

const getProductById = async (req, res) => {
	try {
		const productId = req.params.id;
		const query = `
			SELECT p.*, 
				d.percentage as discount_percentage,
				d.type as discount_type,
				d.id as discount_id,
				d.start_date as discount_start_date,
				d.end_date as discount_end_date
			FROM products p
			LEFT JOIN product_discounts pd ON p.id = pd.product_id
			LEFT JOIN discounts d ON pd.discount_id = d.id
			WHERE p.id = $1
		`;

		const result = await pool.query(query, [productId]);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Товар не найден" });
		}

		const product = formatProductWithDiscount(result.rows[0]);

		res.json(product);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

const createProduct = async (req, res) => {
	try {
		const { title, price, category, description, images } = req.body;

		if (!title || !price || !category || !description || !images) {
			return res.status(400).json({ error: "All fields are required" });
		}

		const result = await pool.query(
			"INSERT INTO products (title, price, category, description, images) VALUES ($1, $2, $3, $4, $5) RETURNING *",
			[title, price, category, description, images]
		);

		res.status(201).json(result.rows[0]);
	} catch (error) {
		console.error("Error add product", error);
		res.status(500).json({ error: "Server error" });
	}
};

const addReview = async (req, res) => {
	try {
		const { productId } = req.params;
		const { text, rating } = req.body;
		const userId = req.user.id;

		if (!userId) {
			return res.status(400).json({ error: "User ID is required" });
		}

		const purchaseCheck = await pool.query(
			"SELECT * FROM user_purchases WHERE user_id = $1 AND product_id = $2",
			[userId, productId]
		);

		if (purchaseCheck.rows.length === 0) {
			return res.status(403).json({
				error: "Вы должны приобрести этот товар, прежде чем оставить отзыв",
			});
		}

		const existingReview = await pool.query(
			"SELECT * FROM reviews WHERE user_id = $1 AND product_id = $2",
			[userId, productId]
		);

		if (existingReview.rows.length > 0) {
			return res.status(403).json({
				error: "Вы уже оставили отзыв на этот товар",
			});
		}

		const mediaUrls = req.files
			? req.files.map((file) => file.path)
			: [];

		if (mediaUrls.length > 10) {
			return res.status(400).json({ error: "Максимум 10 файлов разрешено" });
		}

		const result = await pool.query(
			"INSERT INTO reviews (user_id, product_id, text, rating, media_urls) VALUES ($1, $2, $3, $4, $5) RETURNING *",
			[userId, productId, text, rating, JSON.stringify(mediaUrls)]
		);

		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при добавлении отзыва:", error);
		res.status(500).json({ error: "Ошибка добавления отзыва" });
	}
};

const getReviews = async (req, res) => {
	try {
		const { productId } = req.params;
		const result = await pool.query(
			"SELECT reviews.*, users.name as user_name, users.avatar as user_avatar FROM reviews LEFT JOIN users ON reviews.user_id = users.id WHERE product_id = $1",
			[productId]
		);

		const reviews = result.rows.map((review) => ({
			...review,
			media_urls: JSON.parse(review.media_urls || "[]"),
		}));

		res.json(reviews);
	} catch (error) {
		console.error("Ошибка при получении отзывов:", error);
		res.status(500).json({ error: "Ошибка получения отзывов" });
	}
};

const checkPurchaseStatus = async (req, res) => {
	try {
		 const userId = req.user.id;
		 const productId = req.params.productId;

		 const query = `
			  SELECT o.status
			  FROM orders o
			  JOIN order_items oi ON o.id = oi.order_id
			  WHERE o.user_id = $1 
			  AND oi.product_id = $2 
			  AND o.status = 'delivered'
			  LIMIT 1
		 `;

		 const result = await pool.query(query, [userId, productId]);
		 
		 res.json({
			  hasPurchased: result.rows.length > 0
		 });
	} catch (error) {
		 console.error('Ошибка при проверке статуса покупки:', error);
		 res.status(500).json({ error: 'Ошибка при проверке статуса покупки' });
	}
};

const getProductReviewStats = async (req, res) => {
	try {
		const { productId } = req.params;
		const result = await pool.query(
			`
			  SELECT 
					 COUNT(*) as review_count,
					 COALESCE(AVG(rating), 0) as average_rating
			  FROM reviews 
			  WHERE product_id = $1
		 `,
			[productId]
		);

		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при получении статистики отзывов:", error);
		res.status(500).json({ error: "Ошибка получения статистики отзывов" });
	}
};

const getRelatedProducts = async (req, res) => {
	try {
		const { id } = req.params;
		const limit = 6;

		const productResult = await pool.query(
			"SELECT *, (category->>'id')::int as category_id FROM products WHERE id = $1",
			[id]
		);

		if (productResult.rows.length === 0) {
			return res.status(404).json({ error: "Товар не найден" });
		}

		const product = productResult.rows[0];

		const keywords = [
			"футболка",
			"майка",
			"рубашка",
			"блузка",
			"свитер",
			"куртка",
			"пальто",
			"джинсы",
			"брюки",
			"шорты",
			"юбка",
			"платье",
			"костюм",
			"пиджак",
			"жилет",
			"кардиган",
			"бейсболка",
			"шапка",
			"кепка",
			"наушник",
			"толстовка",
			"джоггеры",
			"стол",
			"кресло",
		];

		const productKeywords = keywords.filter((keyword) =>
			product.title.toLowerCase().includes(keyword)
		);

		let products = [];

		if (productKeywords.length > 0) {
			const query = `
				SELECT p.*,
					COALESCE(AVG(r.rating), 0) as avg_rating,
					d.id as discount_id,
					d.type as discount_type,
					d.percentage as discount_percentage,
					d.start_date as discount_start_date,
					d.end_date as discount_end_date
				FROM products p
				LEFT JOIN reviews r ON p.id = r.product_id
				LEFT JOIN product_discounts pd ON p.id = pd.product_id
				LEFT JOIN discounts d ON pd.discount_id = d.id
				WHERE p.id != $1
				AND (${productKeywords
					.map((_, i) => `LOWER(p.title) LIKE $${i + 2}`)
					.join(" OR ")})
				GROUP BY p.id, d.id, d.type, d.percentage, d.start_date, d.end_date
			`;

			const queryParams = [id, ...productKeywords.map((word) => `%${word}%`)];
			const keywordResult = await pool.query(query, queryParams);
			products = keywordResult.rows;
		}

		if (products.length < limit) {
			const needed = limit - products.length;
			const categoryQuery = `
				SELECT p.*,
					COALESCE(AVG(r.rating), 0) as avg_rating,
					d.id as discount_id,
					d.type as discount_type,
					d.percentage as discount_percentage,
					d.start_date as discount_start_date,
					d.end_date as discount_end_date
				FROM products p
				LEFT JOIN reviews r ON p.id = r.product_id
				LEFT JOIN product_discounts pd ON p.id = pd.product_id
				LEFT JOIN discounts d ON pd.discount_id = d.id
				WHERE p.id != $1 
				AND (p.category->>'id')::int = $2
				${
					products.length > 0
						? `AND p.id NOT IN (${products
								.map((_, i) => `$${i + 3}`)
								.join(", ")})`
						: ""
				}
				GROUP BY p.id, d.id, d.type, d.percentage, d.start_date, d.end_date
				ORDER BY RANDOM()
				LIMIT $${products.length + 3}
			`;

			const categoryParams = [
				id,
				product.category_id,
				...products.map((p) => p.id),
				needed,
			];

			const categoryResult = await pool.query(categoryQuery, categoryParams);
			products = products.concat(categoryResult.rows);
		}

		const formattedProducts = products.map(formatProductWithDiscount);

		res.json(formattedProducts.slice(0, limit));
	} catch (error) {
		console.error("Оибка при получении похожих товаров:", error);
		res.status(500).json({ error: "Ошибка при получении похожих товаров" });
	}
};

const getProductsByIds = async (req, res) => {
	try {
		const { ids } = req.body;
		
		const query = `
			SELECT p.*, 
				d.id as discount_id,
				d.type as discount_type,
				d.percentage as discount_percentage,
				d.start_date as discount_start_date,
				d.end_date as discount_end_date
			FROM products p
			LEFT JOIN product_discounts pd ON p.id = pd.product_id
			LEFT JOIN discounts d ON pd.discount_id = d.id 
				AND CURRENT_TIMESTAMP BETWEEN d.start_date AND d.end_date
			WHERE p.id = ANY($1)
		`;
		
		const result = await pool.query(query, [ids]);
		const productsWithDiscounts = result.rows.map(formatProductWithDiscount);
		
		res.json(productsWithDiscounts);
	} catch (error) {
		console.error('Ошибка при получении продуктов по ID:', error);
		res.status(500).json({ error: 'Ошибка при получении продуктов' });
	}
};

module.exports = {
	getProducts,
	getProductById,
	createProduct,
	addReview,
	getReviews,
	checkPurchaseStatus,
	getProductReviewStats,
	getRelatedProducts,
	getProductsByIds,
};
