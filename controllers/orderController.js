const pool = require("../db");

const checkout = async (req, res) => {
	try {
		const { cart, location, currency } = req.body;
		const userId = req.user.id;

		const zoneQuery =
			location.deliveryMode === "pickup"
				? `SELECT dz.* FROM delivery_zones dz 
			   JOIN delivery_points dp ON dz.id = dp.zone_id 
			   WHERE dp.id = $1`
				: `SELECT dz.* FROM delivery_zones dz 
			   WHERE ST_Contains(dz.geometry, ST_SetSRID(ST_Point($1, $2), 4326))`;

		const zoneParams =
			location.deliveryMode === "pickup"
				? [location.id]
				: [location.coordinates.lng, location.coordinates.lat];

		const zoneResult = await pool.query(zoneQuery, zoneParams);
		const zone = zoneResult.rows[0];

		if (!zone) {
			return res.status(400).json({ error: "Зона доставки не найдена" });
		}

		let cartTotal = 0;
		const updatedCart = [];

		for (const item of cart) {
			const productResult = await pool.query(
				`SELECT p.*, 
					d.percentage AS discount_percentage
				 FROM products p
				 LEFT JOIN product_discounts pd ON p.id = pd.product_id
				 LEFT JOIN discounts d ON pd.discount_id = d.id AND CURRENT_DATE BETWEEN d.start_date AND d.end_date
				 WHERE p.id = $1`,
				[item.id]
			);

			const product = productResult.rows[0];

			const discount = product.discount_percentage || 0;
			const finalPrice = product.price - (product.price * discount) / 100;

			cartTotal += finalPrice * item.quantity;

			updatedCart.push({
				...item,
				price: finalPrice,
			});
		}

		const orderResult = await pool.query(
			`INSERT INTO orders (
				user_id, 
				location, 
				currency, 
				total, 
				order_number,
				status,
				zone_id,
				delivery_speed
			) 
			VALUES ($1, $2, $3, $4, 
				(SELECT COALESCE(MAX(order_number), 0) + 1 FROM orders), 
				'new',
				$5,
				$6
			) 
			RETURNING id, order_number`,
			[
				userId,
				JSON.stringify(location),
				currency,
				cartTotal,
				zone.id,
				location.deliverySpeed || 'regular'
			]
		);
		const orderId = orderResult.rows[0].id;

		for (const item of updatedCart) {
			const deliveryTimeResult = await pool.query(
				`
				SELECT COALESCE(pdt.additional_days, 0) as additional_days
				FROM product_delivery_times pdt
				WHERE pdt.product_id = $1 AND pdt.zone_id = $2
				`,
				[item.id, zone.id]
			);

			const additionalDays = deliveryTimeResult.rows[0]?.additional_days || 0;

			let totalDays = zone.base_delivery_days + additionalDays;

			if (location.deliveryMode === 'courier') {
				if (location.deliverySpeed === 'fast') {
					totalDays -= 1;
				} else {
					totalDays += 1;
				}
			}

			const expectedDeliveryDate = new Date();
			expectedDeliveryDate.setDate(
				expectedDeliveryDate.getDate() + totalDays
			);

			await pool.query(
				"UPDATE products SET quantity = quantity - $1, purchases = purchases + $1 WHERE id = $2",
				[item.quantity, item.id]
			);

			await pool.query(
				"INSERT INTO user_purchases (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING",
				[userId, item.id]
			);

			await pool.query(
				`INSERT INTO order_items (order_id, product_id, quantity, price, expected_delivery_date) 
				 VALUES ($1, $2, $3, $4, $5)`,
				[orderId, item.id, item.quantity, item.price, expectedDeliveryDate]
			);
		}

		res.json({ success: true, orderId });
	} catch (error) {
		console.error("Ошибка при оформлении заказа:", error);
		res.status(500).json({ error: "Ошибка оформления заказа" });
	}
};

const updateOrderStatus = async (req, res) => {
	try {
		const { orderId } = req.params;
		const { status } = req.body;
		const userId = req.user.id;

		const orderCheck = await pool.query(
			"SELECT * FROM orders WHERE id = $1 AND user_id = $2",
			[orderId, userId]
		);

		if (orderCheck.rows.length === 0) {
			return res.status(404).json({ error: "Заказ не найден" });
		}

		const result = await pool.query(
			`UPDATE orders 
			 SET status = $1, 
				 updated_at = CURRENT_TIMESTAMP
			 WHERE id = $2 AND user_id = $3
			 RETURNING *`,
			[status, orderId, userId]
		);

		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при обновлении статуса заказа:", error);
		res.status(500).json({ error: "Ошибка при обновлении статуса заказа" });
	}
};

const getUserOrders = async (req, res) => {
	try {
		const userId = req.user.id;

		const query = `
			SELECT 
				o.id,
				o.order_number,
				o.created_at AS date,
				o.total,
				o.currency,
				o.status,
				o.delivery_speed,
				json_agg(
					json_build_object(
						'id', p.id,
						'title', p.title,
						'price', oi.price,
						'quantity', oi.quantity,
						'image', p.images[1],
						'expected_delivery_date', oi.expected_delivery_date
					)
				) as products
			FROM orders o
			JOIN order_items oi ON o.id = oi.order_id
			JOIN products p ON oi.product_id = p.id
			WHERE o.user_id = $1
			GROUP BY 
				o.id, 
				o.order_number,
				o.created_at,
				o.total,
				o.currency,
				o.status,
				o.delivery_speed
			ORDER BY o.created_at DESC
		`;

		const result = await pool.query(query, [userId]);
		res.json(result.rows);
	} catch (error) {
		console.error("Ошибка при получении заказов пользователя:", error);
		res.status(500).json({ error: "Ошибка при получении заказов пользователя" });
	}
};

module.exports = {
	checkout,
	updateOrderStatus,
	getUserOrders,
};
