const pool = require("../db");
const { formatProductWithDiscount } = require("../utils/productUtils");

const searchProducts = async (req, res) => {
	try {
		const { title } = req.query;

		if (!title) {
			return res.status(400).json({ error: "Поисковый запрос обязателен" });
		}

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
			WHERE LOWER(p.title) LIKE LOWER($1)
			GROUP BY p.id, d.id, d.type, d.percentage, d.start_date, d.end_date
			LIMIT 10
		`;

		const result = await pool.query(query, [`%${title}%`]);
		const productsWithDiscounts = result.rows.map(formatProductWithDiscount);

		res.json(productsWithDiscounts);
	} catch (error) {
		console.error("Ошибка при поиске продуктов:", error);
		res.status(500).json({ error: "Ошибка при поиске продуктов" });
	}
};

const getTopSearchedProducts = async (req, res) => {
	try {
		const query = `
		 SELECT p.*, sh.search_count, sh.last_searched
		 FROM products p
		 LEFT JOIN search_history sh ON p.id = sh.product_id
		 WHERE sh.search_count > 0
		 ORDER BY sh.search_count DESC, sh.last_searched DESC
		 LIMIT 5
	  `;

		const result = await pool.query(query);
		res.json(result.rows);
	} catch (error) {
		console.error("Ошибка при получении популярных товаров:", error);
		res.status(500).json({ error: "Ошибка сервера" });
	}
};

const updateSearchStatistics = async (req, res) => {
	console.log("Received request body:", req.body);
	const { productId } = req.body;

	if (!productId) {
		console.log("ProductId is missing");
		return res.status(400).json({ error: "ID продукта обязателен" });
	}

	try {
		const query = `
			  INSERT INTO search_history (product_id)
			  VALUES ($1)
			  ON CONFLICT (product_id)
			  DO UPDATE SET 
					search_count = search_history.search_count + 1,
					last_searched = CURRENT_TIMESTAMP
			  RETURNING *
		 `;

		const result = await pool.query(query, [productId]);
		console.log("Query result:", result.rows[0]);
		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при обновлении статистики поиска:", error);
		res.status(500).json({ error: "Ошибка при обновлении статистики поиска" });
	}
};

const searchProductsWithFilters = async (req, res) => {
	try {
		let {
			title,
			limit = 18,
			offset = 0,
			sort = "popularity",
			price_min,
			price_max,
			delivery_time,
			zone_id,
		} = req.query;

		if (!title) {
			return res.status(400).json({ error: "Поисковый запрос обязателен" });
		}

		if (!zone_id) {
			return res.status(400).json({ error: "zone_id не указан" });
		}

		zone_id = parseInt(zone_id);

		let baseQuery = `
			SELECT p.*, 
				COALESCE(AVG(r.rating), 0) as avg_rating,
				(p.price - (p.price * COALESCE(d.percentage, 0) / 100)) as final_price,
				d.id as discount_id,
				d.type as discount_type,
				d.percentage as discount_percentage,
				d.start_date as discount_start_date,
				d.end_date as discount_end_date,
				dz.base_delivery_days,
				COALESCE(pdt.additional_days, 0) as additional_delivery_days,
				CEIL(dz.base_delivery_days + COALESCE(pdt.additional_days, 0)) as total_delivery_days
			FROM products p
			LEFT JOIN reviews r ON p.id = r.product_id
			LEFT JOIN product_discounts pd ON p.id = pd.product_id
			LEFT JOIN discounts d ON pd.discount_id = d.id AND CURRENT_TIMESTAMP BETWEEN d.start_date AND d.end_date
			LEFT JOIN delivery_zones dz ON dz.id = $3
			LEFT JOIN product_delivery_times pdt ON p.id = pdt.product_id AND pdt.zone_id = $3
			WHERE LOWER(p.title) LIKE LOWER($1)
		`;

		const queryParams = [`%${title}%`, limit, zone_id];
		let paramIndex = 4;

		if (price_min) {
			baseQuery += ` AND (p.price - (p.price * COALESCE(d.percentage, 0) / 100)) >= $${paramIndex}`;
			queryParams.push(price_min);
			paramIndex++;
		}

		if (price_max) {
			baseQuery += ` AND (p.price - (p.price * COALESCE(d.percentage, 0) / 100)) <= $${paramIndex}`;
			queryParams.push(price_max);
			paramIndex++;
		}

		if (delivery_time && delivery_time !== "any") {
			baseQuery += ` AND CEIL(dz.base_delivery_days + COALESCE(pdt.additional_days, 0)) <= $${paramIndex}`;
			queryParams.push(delivery_time);
			paramIndex++;
		}

		baseQuery += `
			GROUP BY p.id, d.id, d.type, d.percentage, d.start_date, d.end_date, dz.base_delivery_days, pdt.additional_days
		`;

		if (sort) {
			let sortColumn;
			switch (sort) {
				case "popularity":
					sortColumn = "p.purchases DESC";
					break;
				case "rating":
					sortColumn = "avg_rating DESC";
					break;
				case "priceAsc":
					sortColumn = "final_price ASC";
					break;
				case "priceDesc":
					sortColumn = "final_price DESC";
					break;
				case "bestDeal":
					sortColumn = "COALESCE(d.percentage, 0) DESC, final_price ASC";
					break;
				default:
					sortColumn = "p.id";
			}
			baseQuery += ` ORDER BY ${sortColumn}`;
		} else {
			baseQuery += ` ORDER BY p.id`;
		}

		baseQuery += ` LIMIT $2 OFFSET $${paramIndex}`;
		queryParams.push(offset);

		const result = await pool.query(baseQuery, queryParams);
		const productsWithDiscounts = result.rows.map(formatProductWithDiscount);

		res.json(productsWithDiscounts);
	} catch (error) {
		console.error("Ошибка при поиске продуктов:", error);
		res.status(500).json({ error: "Ошибка при поиске продуктов" });
	}
};

module.exports = {
	getTopSearchedProducts,
	updateSearchStatistics,
	searchProducts,
	searchProductsWithFilters,
};
