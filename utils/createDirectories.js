const fs = require("fs");
const path = require("path");

const createUserDirectories = () => {
	const dirs = [
		"uploads",
		"uploads/users",
	];

	dirs.forEach((dir) => {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	});
};

module.exports = createUserDirectories;
