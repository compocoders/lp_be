const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'services', 'classrooms.service.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Convert specific errors
content = content.replace(/throw new Error\('Unauthorized'\);/g, "throw new ApiError(403, 'Unauthorized');");
content = content.replace(/throw new Error\('Room not found'\);/g, "throw new ApiError(404, 'Room not found');");

// Convert remaining generic Errors to 400 ApiErrors
content = content.replace(/throw new Error\(/g, "throw new ApiError(400, ");

fs.writeFileSync(filePath, content);
console.log("Converted raw Errors to ApiErrors.");
