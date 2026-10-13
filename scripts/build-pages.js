import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
await mkdir('pages-dist', { recursive: true });
await cp('static', 'pages-dist', { recursive: true });
await copyFile('public/styles.css', 'pages-dist/styles.css');
await copyFile('public/favicon.svg', 'pages-dist/favicon.svg');
await copyFile('data/quizzes.json', 'pages-dist/quizzes.json');
await writeFile('pages-dist/.nojekyll', '');
console.log('Built playable static game in pages-dist/');
