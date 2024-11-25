const multer = require('multer');
const { cloudinary } = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const crypto = require('crypto');

const storage = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: async (req, file) => {
		const userId = req.user?.id || 'anonymous';
		const userHash = crypto.createHash('md5').update(userId.toString()).digest('hex');
		const productId = req.params.productId || 'general';

		return {
			folder: `users/${userHash}/reviews/${productId}`,
			resource_type: 'auto',
			public_id: `${file.fieldname}-${Date.now()}`,
		};
	},
});

const fileFilter = (req, file, cb) => {
	const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];
	if (allowedTypes.includes(file.mimetype)) {
		cb(null, true);
	} else {
		cb(new Error('Неподдерживаемый тип файла'), false);
	}
};

const upload = multer({
	storage: storage,
	fileFilter,
	limits: {
		fileSize: 50 * 1024 * 1024,
	},
});

module.exports = upload;
