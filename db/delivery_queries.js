const pool = require("../db");

const deliveryQueries = {
	async getNearestDeliveryPoints(lat, lng, limit = 5) {
		const result = await pool.query(
			`
            SELECT 
                *,
                point($1, $2) <-> point(lat, lng) as distance
            FROM delivery_points
            WHERE is_active = true
            ORDER BY distance
            LIMIT $3
        `,
			[lat, lng, limit]
		);
		return result.rows;
	},

	async getDeliveryTimeForProducts(productIds, zoneId) {
		const result = await pool.query(
			`
            SELECT 
                MAX(additional_days) as max_additional_days,
                dz.base_delivery_days
            FROM product_delivery_times pdt
            JOIN delivery_zones dz ON dz.id = pdt.zone_id
            WHERE product_id = ANY($1::int[])
            AND zone_id = $2
            GROUP BY dz.base_delivery_days
        `,
			[productIds, zoneId]
		);
		return result.rows[0];
	},
};

module.exports = deliveryQueries;
