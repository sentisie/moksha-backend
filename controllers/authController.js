const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const fs = require('fs');
const upload = require('../middleware/uploadMiddleware');
const { cloudinary } = require('../config/cloudinary');

const register = async (req, res) => {
	try {
		const { name, email, password, avatar } = req.body;

		const userExists = await pool.query(
			"SELECT * FROM users WHERE email = $1",
			[email]
		);

		if (userExists.rows.length > 0) {
			return res.status(400).json({ 
				error: "Пользователь с такой почтой уже существует" 
			});
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const result = await pool.query(
			"INSERT INTO users (name, email, password, avatar) VALUES ($1, $2, $3, $4) RETURNING *",
			[name, email, hashedPassword, avatar]
		);
		const user = result.rows[0];
		const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
		res.json({
			token,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				avatar: user.avatar,
			},
		});
	} catch (error) {
		console.error("Ошибка при регистрации:", error);
		res.status(500).json({ error: "Ошибка при регистрации пользователя" });
	}
};

const login = async (req, res) => {
	try {
		const { email, phone, password } = req.body;
		
		let query = 'SELECT * FROM users WHERE ';
		let params = [];
		
		if (email) {
			query += 'email = $1';
			params.push(email);
		} else if (phone) {
			query += 'phone = $1';
			params.push(phone);
		} else {
			return res.status(400).json({ error: "Необходимо указать email или телефон" });
		}

		const result = await pool.query(query, params);

		if (result.rows.length === 0) {
			return res.status(400).json({ error: "Пользователь не найден" });
		}

		const user = result.rows[0];
		if (await bcrypt.compare(password, user.password)) {
			const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
			res.json({
				token,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					phone: user.phone,
					avatar: user.avatar,
				}
			});
		} else {
			res.status(400).json({ error: "Неверный пароль" });
		}
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

const getProfile = async (req, res) => {
	try {
		const result = await pool.query(
			"SELECT id, name, email, avatar FROM users WHERE id = $1",
			[req.user.id]
		);
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "User not found" });
		}
		res.json(result.rows[0]);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

const updateProfile = async (req, res) => {
	try {
		const { name, email, phone } = req.body;
		const userId = req.user.id;

		const updateFields = [];
		const updateValues = [];
		let valueIndex = 1;

		if (name) {
			updateFields.push(`name = $${valueIndex}`);
			updateValues.push(name);
			valueIndex++;
		}

		if (email) {
			updateFields.push(`email = $${valueIndex}`);
			updateValues.push(email);
			valueIndex++;
		}

		if (phone) {
			updateFields.push(`phone = $${valueIndex}`);
			updateValues.push(phone);
			valueIndex++;
		}

		if (req.file) {
			const avatarUrl = req.file.path;

			const oldAvatarResult = await pool.query(
				'SELECT avatar FROM users WHERE id = $1',
				[userId]
			);

			const oldAvatarUrl = oldAvatarResult.rows[0]?.avatar;

			if (oldAvatarUrl) {
				const publicId = oldAvatarUrl.split('/').slice(-2).join('/').split('.')[0];
				await cloudinary.uploader.destroy(publicId);
			}

			updateFields.push(`avatar = $${valueIndex}`);
			updateValues.push(avatarUrl);
			valueIndex++;
		} else if (req.body.avatar === "") {
			const oldAvatarResult = await pool.query(
				'SELECT avatar FROM users WHERE id = $1',
				[userId]
			);

			const oldAvatarUrl = oldAvatarResult.rows[0]?.avatar;

			if (oldAvatarUrl) {
				const publicId = oldAvatarUrl.split('/').slice(-2).join('/').split('.')[0];
				await cloudinary.uploader.destroy(publicId);
			}

			updateFields.push(`avatar = NULL`);
		}

		if (updateFields.length === 0) {
			return res.status(400).json({ error: "Нет данных для обновления" });
		}

		updateValues.push(userId);

		const result = await pool.query(
			`UPDATE users 
			 SET ${updateFields.join(', ')} 
			 WHERE id = $${valueIndex} 
			 RETURNING id, name, email, phone, avatar`,
			updateValues
		);

		res.json(result.rows[0]);
	} catch (error) {
		console.error('Ошибка при обновлении профиля:', error);
		res.status(500).json({ error: error.message });
	}
};

const saveCart = async (req, res) => {
	try {
		const userId = req.user.id;
		const { cart } = req.body;

		if (!cart) {
			return res.status(400).json({ error: "Корзина пуста или не предоставлена" });
		}

		await pool.query(
			`INSERT INTO user_carts (user_id, cart_data)
			 VALUES ($1, $2)
			 ON CONFLICT (user_id)
			 DO UPDATE SET cart_data = $2`,
			[userId, JSON.stringify(cart)]
		);

		res.status(200).json({ message: "Корзина сохранена успешно" });
	} catch (error) {
		console.error('Ошибка при сохранении корзины:', error);
		res.status(500).json({ error: 'Ошибка сервера при сохранении корзины' });
	}
};

const loadCart = async (req, res) => {
	try {
		const userId = req.user.id;

		const result = await pool.query(
			`SELECT cart_data FROM user_carts WHERE user_id = $1`,
			[userId]
		);

		if (result.rows.length === 0) {
			return res.status(200).json([]); 
		}

		res.status(200).json(result.rows[0].cart_data);
	} catch (error) {
		console.error('Ошибка при загрузке корзины:', error);
		res.status(500).json({ error: 'Ошибка сервера при загрузке корзины' });
	}
};

const getFullProfile = async (req, res) => {
	try {
		const userId = req.user.id;

		const userResult = await pool.query(
			'SELECT id, name, email, phone, avatar FROM users WHERE id = $1',
			[userId]
		);

		const purchaseResult = await pool.query(`
			SELECT 
				o.id as order_id,
				o.order_number,
				o.created_at as date,
				o.currency,
				json_agg(json_build_object(
					'id', p.id,
					'title', p.title,
					'price', ROUND(oi.price),
					'quantity', oi.quantity,
					'image', p.images[1]
				)) as products,
				ROUND(o.total) as total,
				o.status
			FROM orders o
			JOIN order_items oi ON o.id = oi.order_id
			JOIN products p ON oi.product_id = p.id
			WHERE o.user_id = $1
			GROUP BY o.id, o.order_number, o.created_at, o.currency, o.total, o.status
			ORDER BY o.created_at DESC
		`, [userId]);

		const reviewResult = await pool.query(`
			SELECT 
				r.id,
				r.text,
				r.rating,
				r.media_urls,
				r.created_at,
				r.product_id,
				p.title as product_title,
				o.id as order_id
			FROM reviews r
			JOIN products p ON r.product_id = p.id
			JOIN order_items oi ON r.product_id = oi.product_id
			JOIN orders o ON oi.order_id = o.id
			WHERE r.user_id = $1
			ORDER BY r.created_at DESC
		`, [userId]);

		const pendingReviewsResult = await pool.query(`
			SELECT DISTINCT ON (p.id)
				p.id as product_id,
				p.title as product_title,
				p.images[1] as product_image,
				o.created_at as purchase_date,
				o.status as order_status,
				CASE 
					WHEN EXISTS (
						SELECT 1 FROM orders o2 
						JOIN order_items oi2 ON o2.id = oi2.order_id 
						WHERE o2.user_id = $1 
						AND oi2.product_id = p.id 
						AND o2.status = 'delivered'
					) THEN true 
					ELSE false 
				END as can_review
			FROM orders o
			JOIN order_items oi ON o.id = oi.order_id
			JOIN products p ON oi.product_id = p.id
			LEFT JOIN reviews r ON r.product_id = p.id AND r.user_id = $1
			WHERE o.user_id = $1 AND r.id IS NULL
			ORDER BY p.id, o.created_at DESC
		`, [userId]);

		res.json({
			personalInfo: userResult.rows[0],
			purchaseHistory: purchaseResult.rows,
			reviewHistory: {
				submitted: reviewResult.rows,
				pending: pendingReviewsResult.rows
			}
		});
	} catch (error) {
		console.error('Ошибка при получении профиля:', error);
		res.status(500).json({ error: error.message });
	}
};

const updatePassword = async (req, res) => {
	try {
		const userId = req.user.id;
		const { currentPassword, newPassword } = req.body;

		const result = await pool.query(
			'SELECT password FROM users WHERE id = $1',
			[userId]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Пользователь не найден' });
		}

		const user = result.rows[0];

		const isMatch = await bcrypt.compare(currentPassword, user.password);
		if (!isMatch) {
			return res.status(400).json({ error: 'Неверный текущий пароль' });
		}

		const hashedPassword = await bcrypt.hash(newPassword, 10);

		await pool.query(
			'UPDATE users SET password = $1 WHERE id = $2',
			[hashedPassword, userId]
		);

		res.json({ message: 'Пароль успешно обновлен' });
	} catch (error) {
		console.error('Ошибка при обновлении пароля:', error);
		res.status(500).json({ error: 'Ошибка сервера' });
	}
};

module.exports = {
	register,
	login,
	getProfile,
	updateProfile,
	saveCart,
	loadCart,
	getFullProfile,
	updatePassword
};
