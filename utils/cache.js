const NodeCache = require('node-cache');
const getRedisClient = require('../config/redis');

const localCache = new NodeCache({
	stdTTL: 300,
	checkperiod: 60
});

const cache = {
	async get(key) {
		const localData = localCache.get(key);
		if (localData) return localData;

		try {
			const redisClient = getRedisClient();
			if (redisClient) {
				const redisData = await redisClient.get(key);
				if (redisData) {
					const parsed = JSON.parse(redisData);
					localCache.set(key, parsed);
					return parsed;
				}
			}
		} catch (error) {
			console.warn('Redis get error, using local cache only:', error.message);
		}

		return null;
	},

	async set(key, data, ttl = 3600) {
		localCache.set(key, data);
		try {
			const redisClient = getRedisClient();
			if (redisClient) {
				await redisClient.setEx(key, ttl, JSON.stringify(data));
			}
		} catch (error) {
			console.warn('Redis set error, using local cache only:', error.message);
		}
	},

	async del(key) {
		localCache.del(key);
		try {
			const redisClient = getRedisClient();
			if (redisClient) {
				await redisClient.del(key);
			}
		} catch (error) {
			console.warn('Redis del error:', error.message);
		}
	}
};

module.exports = { cache };
