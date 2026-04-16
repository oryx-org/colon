const fs = require('fs');
fs.readFile('./backend/main.js', 'utf8', (err, data) => {
    console.log(typeof data);
});
