import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cssPath=resolve(projectRoot,'dist/assets/index.css');
const javascriptPath=resolve(projectRoot,'dist/assets/index.js');
const normalize=(value)=>value.replace(/[ \t]+$/gm,'');
const css=normalize(await readFile(cssPath,'utf8'));
const javascript=normalize(await readFile(javascriptPath,'utf8'));
const inlineJavascript=javascript.replaceAll('</script','<\\/script');
const html=`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#102d46" />
    <title>PlanOnIt — plans that make sense</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">${inlineJavascript}</script>
  </body>
</html>
`;

await Promise.all([writeFile(cssPath,css),writeFile(javascriptPath,javascript),writeFile(resolve(projectRoot,'index.html'),html)]);
console.log('Wrote standalone index.html with inlined production assets.');
