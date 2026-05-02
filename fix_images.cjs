const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.html')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./src');
files.push('./index.html');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('src="/image/')) {
        content = content.replace(/src="\/image\//g, 'src="./image/');
        fs.writeFileSync(file, content);
        console.log('Fixed', file);
    }
});
