require("dotenv").config();
const pool = require("../db");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const TRACKINGMORE_API_KEY = process.env.TRACKINGMORE_API_KEY;

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

		const trackingNumber = `TEST${Date.now()}`;
		const courierCode = "china-ems";

		const orderResult = await pool.query(
			`INSERT INTO orders (
				user_id, 
				location, 
				currency, 
				total, 
				order_number,
				status,
				zone_id,
				delivery_speed,
				tracking_number,
				courier_code
			) 
			VALUES ($1, $2, $3, $4, 
				(SELECT COALESCE(MAX(order_number), 0) + 1 FROM orders), 
				'new',
				$5,
				$6,
				$7,
				$8
			) 
			RETURNING id, order_number`,
			[
				userId,
				JSON.stringify(location),
				currency,
				cartTotal,
				zone.id,
				location.deliverySpeed || "regular",
				trackingNumber,
				courierCode,
			]
		);
		const orderId = orderResult.rows[0].id;
		const finalTrackingNumber = `TEST${orderId}`;

		const userResult = await pool.query(
			"SELECT name, email, phone FROM users WHERE id = $1",
			[userId]
		);
		const userData = userResult.rows[0];

		try {
			await createTrackingMore(
				finalTrackingNumber,
				orderId,
				{
					delivery_speed: location.deliverySpeed,
					location: location,
				},
				updatedCart,
				userData
			);

			await pool.query(
				`UPDATE orders SET tracking_number = $1, courier_code = $2 WHERE id = $3`,
				[finalTrackingNumber, courierCode, orderId]
			);
		} catch (error) {
			console.error(
				"Ошибка при создании отслеживания:",
				error.response?.data || error
			);
		}

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

			if (location.deliveryMode === "courier") {
				if (location.deliverySpeed === "fast") {
					totalDays -= 1;
				} else {
					totalDays += 1;
				}
			}

			const expectedDeliveryDate = new Date();
			expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + totalDays);

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

		res.json({
			success: true,
			orderId,
			trackingNumber: finalTrackingNumber,
			courier_code: courierCode,
		});
	} catch (error) {
		console.error("Ошибка при оформлении заказа:", error);
		res.status(500).json({ error: "Ошибка оформления заказа" });
	}
};

const updateOrderStatus = async (req, res) => {
	try {
		const { orderId } = req.params;
		const { status } = req.body;

		const orderResult = await pool.query(
			"SELECT tracking_number FROM orders WHERE id = $1",
			[orderId]
		);

		if (orderResult.rows.length === 0) {
			return res.status(404).json({ error: "Заказ не найден" });
		}

		const { tracking_number } = orderResult.rows[0];

		if (tracking_number) {
			await updateTrackingMoreStatus(tracking_number, status);
		}

		const result = await pool.query(
			"UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
			[status, orderId]
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

		const ordersResult = await pool.query(
			`
			SELECT 
				o.id,
				o.order_number,
				o.created_at as date,
				o.currency,
				o.total,
				o.status,
				o.tracking_number,
				o.courier_code,
				o.delivery_speed,
				json_agg(json_build_object(
					'id', p.id,
					'title', p.title,
					'price', ROUND(oi.price),
					'quantity', oi.quantity,
					'image', p.images[1],
					'expected_delivery_date', oi.expected_delivery_date
				)) as products
			FROM orders o
			JOIN order_items oi ON o.id = oi.order_id
			JOIN products p ON oi.product_id = p.id
			WHERE o.user_id = $1
			GROUP BY o.id
			ORDER BY o.created_at DESC
			`,
			[userId]
		);

		res.json(ordersResult.rows);
	} catch (error) {
		console.error("Ошибка при получении заказов пользователя:", error);
		res.status(500).json({ error: "Ошибка сервера при получении заказов" });
	}
};

const updateTrackingMoreStatus = async (trackingNumber, status) => {
	try {
		const statusNote = (() => {
			switch (status) {
				case "new":
					return "Заказ создан";
				case "in_transit":
					return "Заказ в пути";
				case "delivered":
					return "Заказ доставлен";
				case "cancelled":
					return "Заказ отменен клиентом";
				case "expired":
					return "Срок заказа истек";
				default:
					return "Статус обновлен";
			}
		})();

		const getResponse = await axios({
			method: "get",
			url: `https://api.trackingmore.com/v4/trackings/get`,
				headers: {
					"Content-Type": "application/json",
					"Tracking-Api-Key": process.env.TRACKINGMORE_API_KEY,
				},
				params: {
					tracking_numbers: trackingNumber,
					courier_code: "china-ems",
				},
		});

		const trackingData = getResponse.data?.data?.[0];
		
		if (trackingData) {
			await axios({
				method: "put",
				url: `https://api.trackingmore.com/v4/trackings/modify-courier/${trackingNumber}`,
				headers: {
					"Content-Type": "application/json",
					"Tracking-Api-Key": process.env.TRACKINGMORE_API_KEY,
				},
				data: {
					courier_code: "china-ems",
					note: `${statusNote} (${new Date().toLocaleString()})`,
					title: trackingData.title ? `${trackingData.title} - ${statusNote}` : statusNote
				},
			});
		}

		console.log(`Информация о статусе в TrackingMore обновлена: ${statusNote}`);
	} catch (error) {
		console.error(
			"Ошибка при обновлении информации в TrackingMore:",
			error.response?.data || error
		);
		console.log("Продолжаем обновление статуса в БД...");
	}
};

const createTrackingMore = async (
	trackingNumber,
	orderId,
	orderData,
	products,
	userData
) => {
	try {
		console.log("Отправка запроса на создание отслеживания в TrackingMore");

		const productsInfo = products
			.map((product) => `${product.title} (${product.quantity} шт.)`)
			.join(", ");

		const orderDate = new Date().toISOString();

		const response = await axios({
			method: "post",
			url: "https://api.trackingmore.com/v4/trackings/create",
			headers: {
				"Content-Type": "application/json",
				"Tracking-Api-Key": process.env.TRACKINGMORE_API_KEY,
			},
			data: {
				tracking_number: trackingNumber,
				courier_code: "china-ems",
				order_number: orderId.toString(),
				order_date: orderDate,
				order_id: orderId.toString(),
				customer_name: userData.name || "Customer",
				customer_email: userData.email,
				customer_sms: userData.phone,
				title: `Заказ #${orderId}: ${productsInfo}`,
				destination_country_iso2: "RU",
				origin_country_iso2: "CN",
				logistics_channel:
					orderData.delivery_speed === "fast"
						? "Быстрая доставка"
						: "Обычная доставка",
				recipient_postcode: orderData.location?.postal_code,
				language: "ru",
				note: `Товары: ${productsInfo}`,
				tracking_postal_code: orderData.location?.postal_code,
				tracking_destination_country: "RU",
				tracking_origin_country: "CN",
			},
		});

		return response.data;
	} catch (error) {
		console.error(
			"Ошибка при создании отслеживания:",
			error.response?.data || error
		);
		throw error;
	}
};

module.exports = {
	checkout,
	updateOrderStatus,
	getUserOrders,
	updateTrackingMoreStatus,
};
