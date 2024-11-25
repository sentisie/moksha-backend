const pool = require('../db');

exports.getFavorites = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 18, offset = 0 } = req.query;

        const query = `
            SELECT p.*, 
                d.id AS discount_id,
                d.type AS discount_type,
                d.percentage AS discount_percentage,
                d.start_date AS discount_start_date,
                d.end_date AS discount_end_date,
                f.date_added AS favorite_date_added
            FROM favorites f
            JOIN products p ON f.product_id = p.id
            LEFT JOIN product_discounts pd ON p.id = pd.product_id
            LEFT JOIN discounts d ON pd.discount_id = d.id
            WHERE f.user_id = $1
            ORDER BY f.date_added DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await pool.query(query, [userId, limit, offset]);

        const favoritesWithDiscounts = result.rows.map((product) => {
            const {
                discount_id,
                discount_type,
                discount_percentage,
                discount_start_date,
                discount_end_date,
                favorite_date_added,
                ...rest
            } = product;

            return {
                ...rest,
                date_added: favorite_date_added, 
                discount: discount_id
                    ? {
                        id: discount_id,
                        type: discount_type,
                        percentage: discount_percentage,
                        start_date: discount_start_date,
                        end_date: discount_end_date,
                    }
                    : null,
            };
        });

        res.json(favoritesWithDiscounts);
    } catch (error) {
        console.error('Ошибка при получении избранного:', error);
        res.status(500).json({ error: 'Ошибка при получении избранного' });
    }
};

exports.addFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const { productId } = req.body;

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
            [userId]
        );
        const favoriteCount = parseInt(countResult.rows[0].count);

        if (favoriteCount >= 500) {
            return res.status(400).json({ error: 'Лимит избранных товаров достигнут' });
        }

        await pool.query(
            'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, productId]
        );

        const result = await pool.query(
            `SELECT p.*, f.date_added
             FROM favorites f
             JOIN products p ON f.product_id = p.id
             WHERE f.user_id = $1 AND f.product_id = $2`,
            [userId, productId]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при добавлении в избранное' });
    }
};

exports.removeFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const productId = req.params.productId;

        await pool.query(
            'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
            [userId, productId]
        );
        res.json({ message: 'Товар удален из избранного' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при удалении из избранного' });
    }
};