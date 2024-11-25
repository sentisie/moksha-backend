const pool = require("../db");

const subscribe = async (req, res) => {
	try {
		const { email } = req.body;

		const existingSubscriber = await pool.query(
			"SELECT * FROM subscribers WHERE email = $1",
			[email]
		);

		if (existingSubscriber.rows.length > 0) {
			return res.status(400).json({
				error: "Этот email уже подписан на рассылку",
			});
		}

		await pool.query(
			"INSERT INTO subscribers (email, created_at) VALUES ($1, NOW())",
			[email]
		);

		res.status(201).json({
			message: "Вы успешно подписались на рассылку",
		});
	} catch (error) {
		console.error("Ошибка при подписке:", error);
		res.status(500).json({
			error: "Ошибка при обработке подписки",
		});
	}
};

module.exports = {
	subscribe,
};
