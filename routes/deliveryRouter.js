const Router = require("express");
const router = new Router();
const deliveryController = require("../controllers/deliveryController");
const checkRole = require("../middleware/checkRoleMiddleware");
const authenticateToken = require("../middleware/auth");
const validateRequest = require("../middleware/validateMiddleware");
const {
	deliveryZoneSchema,
	deliveryPointSchema,
	calculateDeliverySchema,
} = require("../utils/validationSchemas");

// Публичные маршруты
router.get("/points", deliveryController.getDeliveryPoints);
router.get("/zones", deliveryController.getDeliveryZones);
router.get("/nearest", deliveryController.findNearestPoint);

// Маршрут для расчета времени доставки
router.post(
	"/calculate",
	// authenticateToken,
	validateRequest(calculateDeliverySchema),
	deliveryController.calculateDeliveryTime
);

// Добавим новые маршруты
router.get("/points/radius", deliveryController.findPointsInRadius);
router.get("/stats", checkRole("ADMIN"), deliveryController.getDeliveryStats);

// Защищенные маршруты (только для админов)
router.post(
	"/zones",
	checkRole("ADMIN"),
	validateRequest(deliveryZoneSchema),
	deliveryController.createDeliveryZone
);
router.put(
	"/zones/:id",
	checkRole("ADMIN"),
	deliveryController.updateDeliveryZone
);
router.post(
	"/points",
	checkRole("ADMIN"),
	validateRequest(deliveryPointSchema),
	deliveryController.createDeliveryPoint
);
router.put(
	"/points/:id",
	checkRole("ADMIN"),
	deliveryController.updateDeliveryPoint
);

router.get('/zone', deliveryController.getDeliveryZoneByCoordinates);

module.exports = router;
