const multer = require('multer');
const { cloudinary } = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const crypto = require('crypto');

const avatarStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const userId = req.user?.id || 'anonymous';
        const userHash = crypto.createHash('md5').update(userId.toString()).digest('hex');

        return {
            folder: `users/${userHash}/avatars`,
            resource_type: 'image',
            allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
            transformation: [
                { width: 400, height: 400, crop: 'fill' },
                { quality: 'auto' }
            ],
            public_id: `avatar-${Date.now()}`,
        };
    },
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Неподдерживаемый тип файла'), false);
    }
};

const avatarUpload = multer({
    storage: avatarStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

module.exports = avatarUpload; 