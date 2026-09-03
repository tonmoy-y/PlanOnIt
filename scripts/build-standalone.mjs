import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const assetsDir=resolve(projectRoot,'dist/assets');
// Vite now content-hashes the built filenames (assets/index-<hash>.js/.css) so Netlify's
// immutable long-lived cache header is safe across deploys. There is exactly one JS
// entry and one CSS file (no dynamic imports in this app), so find them by extension
// rather than assuming a fixed name.
const builtAssets=await readdir(assetsDir);
const cssName=builtAssets.find(name=>name.endsWith('.css'));
const jsName=builtAssets.find(name=>name.endsWith('.js'));
if(!cssName||!jsName)throw new Error(`Expected one built .css and one built .js in ${assetsDir}, found: ${builtAssets.join(', ')}`);
const cssPath=resolve(assetsDir,cssName);
const javascriptPath=resolve(assetsDir,jsName);
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
