const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace import('./utils').then(m => m.closeModal(...))
    content = content.replace(/import\('\.\/utils'\)\.then\(m => m\.closeModal\((.*?)\)\)/g, 'window.closeModal($1)');
    content = content.replace(/import\('\.\/utils'\)\.then\(async m => m\.closeModal\((.*?)\)\)/g, 'window.closeModal($1)');
    
    // Replace customAlert
    content = content.replace(/import\('\.\/utils'\)\.then\(m => m\.customAlert\((.*?)\)\)/g, 'window.customAlert($1)');
    
    // Replace customToast
    content = content.replace(/import\('\.\/utils'\)\.then\(m => m\.customToast\((.*?)\)\)/g, 'window.customToast($1)');
    
    fs.writeFileSync(filePath, content);
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            replaceInFile(fullPath);
        }
    }
}

walk('./src');
console.log('Fixed imports in HTML strings');
