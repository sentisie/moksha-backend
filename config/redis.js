const Redis = require("redis");

let redisClient = null;

const getRedisClient = () => {
	if (!redisClient) {
		redisClient = Redis.createClient({
			url: process.env.REDIS_URL || "redis://localhost:6379",
			password: process.env.REDIS_PASSWORD,
			retry_strategy: function (options) {
				if (
					options.error &&
					(options.error.code === "ECONNREFUSED" ||
						options.error.code === "EACCES")
				) {
					console.warn("Redis connection failed, using memory-only cache");
					return false;
				}
				return Math.min(options.attempt * 100, 3000);
			},
		});

		redisClient.on("error", (err) => {
			console.warn("Redis Client Error:", err.message);
		});
	}
	return redisClient;
};

module.exports = getRedisClient;
