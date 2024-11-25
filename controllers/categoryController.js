const pool = require("../db");
const { formatProductWithDiscount } = require("../utils/productUtils");

const getCategories = async (req, res) => {
	try {
		const result = await pool.query("SELECT * FROM categories");
		res.json(result.rows);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

const getCategoryProducts = async (req, res) => {
	try {
		const categoryId = req.params.id;
		let {
			limit = 18,
			offset = 0,
			sort,
			price_min,
			price_max,
			delivery_time,
		} = req.query;

		limit = parseInt(limit);
		offset = parseInt(offset);

		if (delivery_time && delivery_time !== "any") {
			delivery_time = parseInt(delivery_time);
			if (isNaN(delivery_time)) {
				return res
					.status(400)
					.json({ error: "Некорректное значение delivery_time" });
			}
		} else {
			delivery_time = null;
		}

		const zone_id = parseInt(req.query.zone_id);

		if (!zone_id) {
			return res.status(400).json({ error: "zone_id не указан" });
		}

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
			LEFT JOIN delivery_zones dz ON dz.id = $2
			LEFT JOIN product_delivery_times pdt ON p.id = pdt.product_id AND pdt.zone_id = $2
			WHERE p.category->>'id' = $1
		`;

		const queryParams = [categoryId, zone_id];
		let paramIndex = 3;

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
		if (delivery_time !== null) {
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

		baseQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
		queryParams.push(limit, offset);

		const result = await pool.query(baseQuery, queryParams);
		const productsWithDiscounts = result.rows.map(formatProductWithDiscount);

		res.json(productsWithDiscounts);
	} catch (error) {
		console.error("Ошибка при получении товаров категории:", error);
		res.status(500).json({ error: "Ошибка при получении товаров категории" });
	}
};

module.exports = {
	getCategories,
	getCategoryProducts,
};
