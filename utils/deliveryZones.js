module.exports = [
	{
		id: 1,
		name: "Центральная Россия",
		base_delivery_days: 3,
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[35.0, 54.0],
					[40.0, 54.0],
					[40.0, 58.0],
					[35.0, 58.0],
					[35.0, 54.0],
				],
			],
		},
	},
	{
		id: 2,
		name: "Урал",
		base_delivery_days: 5,
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[55.0, 50.0],
					[65.0, 50.0],
					[65.0, 60.0],
					[55.0, 60.0],
					[55.0, 50.0],
				],
			],
		},
	},
	{
		id: 3,
		name: "Сибирь",
		base_delivery_days: 7,
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[70.0, 50.0],
					[110.0, 50.0],
					[110.0, 65.0],
					[70.0, 65.0],
					[70.0, 50.0],
				],
			],
		},
	},
	{
		id: 4,
		name: "Дальний Восток",
		base_delivery_days: 10,
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[120.0, 42.0],
					[145.0, 42.0],
					[145.0, 60.0],
					[120.0, 60.0],
					[120.0, 42.0],
				],
			],
		},
	},
];
