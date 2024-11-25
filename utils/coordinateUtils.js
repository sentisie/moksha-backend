const calculateDistance = (lat1, lon1, lat2, lon2) => {
	const R = 6371;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
};

const toRad = (value) => {
	return (value * Math.PI) / 180;
};

const isValidCoordinates = (lat, lng) => {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

module.exports = {
	calculateDistance,
	isValidCoordinates,
};
