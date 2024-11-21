const { cache } = require("../utils/cache");

const cacheMiddleware = (keyFn, ttl) => {
	return async (req, res, next) => {
		try {
			const key = typeof keyFn === "function" ? keyFn(req) : keyFn;

			const cachedData = await cache.get(key);

			if (cachedData) {
				return res.json(cachedData);
			}

			const originalJson = res.json;

			res.json = function (data) {
				cache.set(key, data, ttl);

				return originalJson.call(this, data);
			};

			next();
		} catch (error) {
			console.error("Cache middleware error:", error);
			next();
		}
	};
};

module.exports = cacheMiddleware;
