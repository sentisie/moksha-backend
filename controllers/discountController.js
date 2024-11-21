const pool = require("../db");

const getDiscountedProducts = async (req, res) => {
	try {
		const discountType = req.path.includes("11-11") ? "EVENT_11_11" : "REGULAR";
		const limit = parseInt(req.query.limit) || 20;
		const offset = parseInt(req.query.offset) || 0;

		const countQuery = `
			SELECT COUNT(*) 
			FROM products p
			JOIN product_discounts pd ON p.id = pd.product_id
			JOIN discounts d ON pd.discount_id = d.id
			WHERE d.type = $1
			AND CURRENT_TIMESTAMP BETWEEN d.start_date AND d.end_date
		`;
		
		const countResult = await pool.query(countQuery, [discountType]);
		const totalCount = parseInt(countResult.rows[0].count);

		if (offset >= totalCount) {
			return res.json([]);
		}

		const query = `
			SELECT p.*, 
				d.id as discount_id,
				d.type as discount_type,
				d.percentage as discount_percentage,
				d.start_date as discount_start_date,
				d.end_date as discount_end_date
			FROM products p
			JOIN product_discounts pd ON p.id = pd.product_id
			JOIN discounts d ON pd.discount_id = d.id
			WHERE d.type = $1
			AND CURRENT_TIMESTAMP BETWEEN d.start_date AND d.end_date
			LIMIT $2 OFFSET $3
		`;

		const result = await pool.query(query, [discountType, limit, offset]);
		
		const productsWithDiscounts = result.rows.map((product) => {
			const {
				discount_id,
				discount_type,
				discount_percentage,
				discount_start_date,
				discount_end_date,
				...rest
			} = product;

			return {
				...rest,
				discount: {
					id: discount_id,
					type: discount_type,
					percentage: discount_percentage,
					start_date: discount_start_date,
					end_date: discount_end_date,
				},
			};
		});

		res.json(productsWithDiscounts);
	} catch (error) {
		console.error("Ошибка при получении товаров со скидками:", error);
		res.status(500).json({ error: "Ошибка получения товаров со скидками" });
	}
};

module.exports = {
	getDiscountedProducts,
};
