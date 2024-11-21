const pool = require("../db");
const {
	calculateDistance,
	isValidCoordinates,
} = require("../utils/coordinateUtils");
const validateRequest = require("../middleware/validateMiddleware");
const {
	deliveryZoneSchema,
	deliveryPointSchema,
	calculateDeliverySchema,
} = require("../utils/validationSchemas");
const { cache } = require("../utils/cache");
const { cacheKeys } = require("../utils/cacheKeys");

const getDeliveryPoints = async (req, res) => {
	try {
		const cachedPoints = await cache.get(cacheKeys.DELIVERY_POINTS);
		if (cachedPoints) {
			return res.json(cachedPoints);
		}

		const result = await pool.query(`
            SELECT 
                dp.*,
                dz.name as zone_name,
                dz.base_delivery_days
            FROM delivery_points dp
            JOIN delivery_zones dz ON dp.zone_id = dz.id
            WHERE dp.is_active = true
            ORDER BY dp.city
        `);

		if (result.rows.length > 0) {
			await cache.set(cacheKeys.DELIVERY_POINTS, result.rows, 1800);
		}

		res.json(result.rows);
	} catch (error) {
		console.error("Ошибка при получении точек доставки:", error);
		res.status(500).json({ error: "Ошибка при получении точек доставки" });
	}
};

const getDeliveryZones = async (req, res) => {
	try {
		const result = await pool.query(`
            SELECT 
                dz.*,
                json_agg(dp.*) as delivery_points
            FROM delivery_zones dz
            LEFT JOIN delivery_points dp ON dz.id = dp.zone_id
            WHERE dp.is_active = true
            GROUP BY dz.id
        `);

		res.json(result.rows);
	} catch (error) {
		console.error("Ошибка при получении зон доставки:", error);
		res.status(500).json({ error: "Ошибка при получении зон доставки" });
	}
};

const calculateDeliveryTime = async (req, res) => {
	try {
		const { productIds, locationId, deliveryMode, deliverySpeed } = req.body;

		if (!productIds || !deliveryMode) {
			return res.status(400).json({ error: "Отсутствуют необходимые параметры" });
		}

		let baseDeliveryDays = 0;
		let zoneId = null;

		if (deliveryMode === 'pickup') {
			if (locationId == null) {
				return res.status(400).json({ error: "Отсутствует locationId для pickup" });
			}

			const deliveryPointQuery = `
				SELECT dp.*, dz.base_delivery_days 
				FROM delivery_points dp
				JOIN delivery_zones dz ON dp.zone_id = dz.id
				WHERE dp.id = $1
			`;

			const deliveryPointResult = await pool.query(deliveryPointQuery, [locationId]);
			const deliveryPoint = deliveryPointResult.rows[0];

			if (!deliveryPoint) {
				return res.status(404).json({ error: "Точка доставки не найдена" });
			}

			baseDeliveryDays = deliveryPoint.base_delivery_days;
			zoneId = deliveryPoint.zone_id;

		} else if (deliveryMode === 'courier') {
			const { coordinates } = req.body;
			const { lat, lng } = coordinates || {};

			if (!lat || !lng) {
				return res.status(400).json({ error: "Отсутствуют координаты для курьерской доставки" });
			}

			const zoneQuery = `
				SELECT dz.*
				FROM delivery_zones dz
				WHERE ST_Contains(dz.geometry, ST_SetSRID(ST_Point($1, $2), 4326))
				LIMIT 1
			`;

			const zoneResult = await pool.query(zoneQuery, [lng, lat]);

			const zone = zoneResult.rows[0];

			if (!zone) {
				return res.status(404).json({ error: "Нет зон доставки для указанных координат" });
			}

			baseDeliveryDays = zone.base_delivery_days;
			zoneId = zone.id;

		} else {
			return res.status(400).json({ error: "Неверный режим доставки" });
		}

		const productDeliveryTimesQuery = `
			SELECT 
				pdt.product_id,
				COALESCE(pdt.additional_days, 0) as additional_days
			FROM product_delivery_times pdt
			WHERE pdt.product_id = ANY($1::int[]) AND pdt.zone_id = $2
		`;

		const productDeliveryTimesResult = await pool.query(
			productDeliveryTimesQuery,
			[productIds, zoneId]
		);

		const productDeliveryTimes = productDeliveryTimesResult.rows;

		const results = productIds.map((productId) => {
			const productDeliveryTime = productDeliveryTimes.find(
				(pdt) => pdt.product_id === productId
			);

			const additionalDays = productDeliveryTime
				? productDeliveryTime.additional_days
				: 0;

			let totalDays = baseDeliveryDays + additionalDays;

			if (deliveryMode === "courier") {
				if (deliverySpeed === "fast") {
					totalDays -= 1;
				} else {
					totalDays += 1;
				}
			}

			return {
				productId,
				deliveryDays: totalDays,
			};
		});

		res.json(results);
	} catch (error) {
		console.error("Ошибка при расчёте времени доставки:", error);
		res.status(500).json({ error: "Ошибка при расчёте времени доставки" });
	}
};

const updateDeliveryTime = async (req, res) => {
	try {
		const { productId, zoneId, additionalDays } = req.body;

		const result = await pool.query(
			`
			INSERT INTO product_delivery_times (product_id, zone_id, additional_days)
			VALUES ($1, $2, $3)
			ON CONFLICT (product_id, zone_id)
			DO UPDATE SET additional_days = $3
			RETURNING *
		`,
			[productId, zoneId, additionalDays]
		);

		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при обновлении времени доставки:", error);
		res.status(500).json({ error: "Ошибка при обновлении времени доставки" });
	}
};

const createDeliveryZone = async (req, res) => {
	try {
		const { name, base_delivery_days } = req.body;
		const result = await pool.query(
			`INSERT INTO delivery_zones (name, base_delivery_days) 
			 VALUES ($1, $2) 
			 RETURNING *`,
			[name, base_delivery_days]
		);
		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при создании зоны доставки:", error);
		res.status(500).json({ error: "Ош��бка при создании зоны доставки" });
	}
};

const updateDeliveryZone = async (req, res) => {
	try {
		const { id } = req.params;
		const { name, base_delivery_days } = req.body;
		const result = await pool.query(
			`UPDATE delivery_zones 
			 SET name = $1, base_delivery_days = $2, updated_at = CURRENT_TIMESTAMP
			 WHERE id = $3 
			 RETURNING *`,
			[name, base_delivery_days, id]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Зона доставки не найдена" });
		}

		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при обновлении зоны доставки:", error);
		res.status(500).json({ error: "Ошибка при обновлении зоны доставки" });
	}
};

const createDeliveryPoint = async (req, res) => {
	try {
		const { zone_id, city, address, lat, lng, delivery_days } = req.body;
		const result = await pool.query(
			`INSERT INTO delivery_points 
			 (zone_id, city, address, lat, lng, delivery_days) 
			 VALUES ($1, $2, $3, $4, $5, $6) 
			 RETURNING *`,
			[zone_id, city, address, lat, lng, delivery_days]
		);

		await invalidateDeliveryCache();
		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при создании точки доставки:", error);
		res.status(500).json({ error: "Ошибка при создании точки доставки" });
	}
};

const updateDeliveryPoint = async (req, res) => {
	try {
		const { id } = req.params;
		const { zone_id, city, address, lat, lng, delivery_days, is_active } =
			req.body;
		const result = await pool.query(
			`UPDATE delivery_points 
			 SET zone_id = $1, city = $2, address = $3, lat = $4, lng = $5, 
				 delivery_days = $6, is_active = $7, updated_at = CURRENT_TIMESTAMP
			 WHERE id = $8 
			 RETURNING *`,
			[zone_id, city, address, lat, lng, delivery_days, is_active, id]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Точка доставки не найдена" });
		}

		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при обновлении точки доставки:", error);
		res.status(500).json({ error: "Ошибка при обновлении точки доставки" });
	}
};

const findNearestPoints = async (req, res) => {
	try {
		const { lat, lng, limit = 5 } = req.query;
		const result = await pool.query(
			`
			SELECT 
				*,
				point($1, $2) <-> point(lat, lng) as distance
			FROM delivery_points
			WHERE is_active = true
			ORDER BY point($1, $2) <-> point(lat, lng)
			LIMIT $3
		`,
			[lat, lng, limit]
		);

		res.json(result.rows);
	} catch (error) {
		console.error("Ошибка при поиске ближайших точек доставки:", error);
		res
			.status(500)
			.json({ error: "Ошибка при поиске ближайших точек доставки" });
	}
};

const findPointsInRadius = async (req, res) => {
	try {
		const { lat, lng, radius = 50 } = req.query;

		if (!isValidCoordinates(parseFloat(lat), parseFloat(lng))) {
			return res.status(400).json({ error: "Некорректные координаты" });
		}

		const result = await pool.query(
			`
			SELECT 
				*,
				point($1, $2) <-> point(lat, lng) * 111.32 as distance_km
			FROM delivery_points
			WHERE is_active = true
			AND point($1, $2) <-> point(lat, lng) * 111.32 <= $3
			ORDER BY distance_km
		`,
			[lat, lng, radius]
		);

		res.json(result.rows);
	} catch (error) {
		console.error("Ошибка при писке точек доставки:", error);
		res.status(500).json({ error: "Ошибка при поиске точек достав��и" });
	}
};

const getDeliveryStats = async (req, res) => {
	try {
		const result = await pool.query(`
			SELECT 
				dz.name as zone_name,
				COUNT(dp.id) as points_count,
				AVG(dp.delivery_days) as avg_delivery_days,
				COUNT(DISTINCT pdt.product_id) as products_with_extra_time
			FROM delivery_zones dz
			LEFT JOIN delivery_points dp ON dz.id = dp.zone_id
			LEFT JOIN product_delivery_times pdt ON dz.id = pdt.zone_id
			GROUP BY dz.id, dz.name
			ORDER BY dz.name
		`);

		res.json(result.rows);
	} catch (error) {
		console.error("Ошибка при получении статистики:", error);
		res.status(500).json({ error: "Ошибка при получении статистики" });
	}
};

const invalidateDeliveryCache = async () => {
	await cache.invalidatePattern("delivery_*");
};

const findNearestPoint = async (req, res) => {
	try {
		const { lat, lng } = req.query;

		if (!isValidCoordinates(parseFloat(lat), parseFloat(lng))) {
			return res.status(400).json({ error: "Некорректные координаты" });
		}

		const result = await pool.query(
			`
			SELECT 
				dp.*,
				(point($1, $2) <-> point(dp.lat, dp.lng)) * 111.32 as distance_km
			FROM delivery_points dp
			WHERE dp.is_active = true
			ORDER BY distance_km
			LIMIT 1
		`,
			[lat, lng]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Нет доступных точек доставки" });
		}

		res.json(result.rows[0]);
	} catch (error) {
		console.error("Ошибка при поиске ближайшей точки доставки:", error);
		res
			.status(500)
			.json({ error: "Ошибка при поиске бижайшей точки доставки" });
	}
};

const getDeliveryZoneByCoordinates = async (req, res) => {
	try {
		const { lat, lng } = req.query;

		if (!lat || !lng) {
			return res.status(400).json({ error: "Отсутствуют координаты" });
		}

		const zoneQuery = `
			SELECT dz.*
			FROM delivery_zones dz
			WHERE ST_Contains(dz.geometry, ST_SetSRID(ST_Point($1, $2), 4326))
			LIMIT 1
		`;

		const zoneResult = await pool.query(zoneQuery, [lng, lat]);

		const zone = zoneResult.rows[0];

		if (!zone) {
			return res.status(404).json({ error: "Зона доставки не найдена для указанных координат" });
		}

		res.json(zone);
	} catch (error) {
		console.error("Ошибка при определении зоны д��ставки по координатам:", error);
		res.status(500).json({ error: "Ошибка при определении зоны доставки" });
	}
};

module.exports = {
	getDeliveryPoints,
	getDeliveryZones,
	calculateDeliveryTime,
	createDeliveryZone,
	updateDeliveryZone,
	createDeliveryPoint,
	updateDeliveryPoint,
	findNearestPoints,
	findPointsInRadius,
	getDeliveryStats,
	findNearestPoint,
	getDeliveryZoneByCoordinates,
};
