// Builds index.html: a standalone page (the artifact host adds this skeleton itself).
const fs = require('fs');
const page = fs.readFileSync('src/page.html', 'utf8').replace('/*CORE*/', () => fs.readFileSync('src/core.js', 'utf8'));
const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n</head>\n<body>\n';
fs.writeFileSync('index.html', head + page + '\n</body>\n</html>\n');
