const formatProductWithDiscount = (product) => {
	const {
		discount_id,
		discount_type,
		discount_percentage,
		discount_start_date,
		discount_end_date,
		...rest
	} = product;

	const now = new Date();
	const isDiscountActive =
		discount_start_date &&
		discount_end_date &&
		now >= new Date(discount_start_date) &&
		now <= new Date(discount_end_date);

	return {
		...rest,
		discount:
			discount_id && isDiscountActive
				? {
						id: discount_id,
						type: discount_type,
						percentage: discount_percentage,
						start_date: discount_start_date,
						end_date: discount_end_date,
				  }
				: null,
	};
};

module.exports = {
	formatProductWithDiscount,
};
