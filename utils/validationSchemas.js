const Joi = require('joi');

const deliveryZoneSchema = Joi.object({
	name: Joi.string().required().min(3).max(255),
	base_delivery_days: Joi.number().required().min(0).max(30),
});

const deliveryPointSchema = Joi.object({
	zone_id: Joi.number().required().positive(),
	city: Joi.string().required().min(2).max(255),
	address: Joi.string().required().min(5),
	lat: Joi.number().required().min(-90).max(90),
	lng: Joi.number().required().min(-180).max(180),
	delivery_days: Joi.number().required().min(0).max(30),
	is_active: Joi.boolean(),
});

const calculateDeliverySchema = Joi.object({
	productIds: Joi.array().items(Joi.number().integer().required()).required(),
	locationId: Joi.when('deliveryMode', {
		is: 'pickup',
		then: Joi.number().integer().required(),
		otherwise: Joi.forbidden(),
	}),
	deliveryMode: Joi.string().valid('pickup', 'courier').required(),
	deliverySpeed: Joi.when('deliveryMode', {
		is: 'courier',
		then: Joi.string().valid('regular', 'fast').required(),
		otherwise: Joi.forbidden(),
	}),
	coordinates: Joi.when('deliveryMode', {
		is: 'courier',
		then: Joi.object({
			lat: Joi.number().required().min(-90).max(90),
			lng: Joi.number().required().min(-180).max(180),
		}).required(),
		otherwise: Joi.forbidden(),
	}),
});

module.exports = {
	deliveryZoneSchema,
	deliveryPointSchema,
	calculateDeliverySchema,
};
