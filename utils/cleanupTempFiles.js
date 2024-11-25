const fs = require("fs");
const path = require("path");

const cleanupTempFiles = () => {
	const tempDir = "uploads/temp";

	fs.readdir(tempDir, (err, files) => {
		if (err) {
			console.error("Ошибка при чтении временной директории:", err);
			return;
		}

		files.forEach((file) => {
			const filePath = path.join(tempDir, file);
			const stats = fs.statSync(filePath);
			const now = new Date().getTime();
			const fileAge = now - stats.mtime.getTime();

			if (fileAge > 24 * 60 * 60 * 1000) {
				fs.unlink(filePath, (err) => {
					if (err) {
						console.error("Ошибка при удалении временного файла:", err);
					}
				});
			}
		});
	});
};

module.exports = cleanupTempFiles;
