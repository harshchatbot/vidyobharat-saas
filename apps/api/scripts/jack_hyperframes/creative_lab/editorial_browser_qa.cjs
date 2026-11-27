const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createRequire} = require('node:module');

async function main() {
  const [moduleRoot, output, injected] = process.argv.slice(2);
  const req = createRequire(path.resolve(moduleRoot, 'package.json'));
  let playwright;
  try { playwright = req('playwright'); } catch { playwright = req('playwright-core'); }
  const {project, entry, renderer} = JSON.parse(fs.readFileSync(path.join(output, 'composition_entry.json')));
  if (renderer !== 'editorial') throw new Error('Expected actual JACK editorial composition');
  const {shots} = JSON.parse(fs.readFileSync(path.join(output, 'production_plan.json')));
  const report = {scope: 'editorial DOM and visible approved media', defects: [], samples: []};
  const stem = injected ? 'injected_' : '';
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(project, '.' + pathname);
    if (!file.startsWith(project + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      if (error) return response.writeHead(404).end();
      const extensions = {'.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.jpg':'image/jpeg'};
      response.writeHead(200, {'Content-Type': extensions[path.extname(file)] || 'application/octet-stream'}).end(bytes);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    browser = await playwright.chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:1080,height:1920}});
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    const add = (code, detail, extra={}) => report.defects.push({code, detail, severity:'high', ...extra});
    page.on('pageerror', error => add('javascript_error', error.message));
    page.on('requestfailed', request => add('resource_failure', request.url()));
    page.on('response', response => {if (response.status() >= 400) add('resource_failure', response.url());});
    await page.goto(base + '/' + encodeURIComponent(entry));
    await page.waitForFunction(() => !!window.__timelines?.main);
    if (injected) {
      await page.addStyleTag({content: '.caption{left:-140px!important}.headline{max-height:14px!important;overflow:hidden!important}'});
    }
    for (const [scene, shot] of shots.entries()) {
      for (const fraction of [.2,.5,.85]) {
        const seconds = (shot.start_frame+(shot.end_frame-shot.start_frame)*fraction)/30;
        const snapshot = await page.evaluate(async ({seconds, broken}) => {
          window.__timelines.main.seek(seconds,false);
          const scene = document.querySelector('.scene');
          const asset = scene.querySelector('img');
          if (asset && broken) asset.src = 'missing-fixture-image.png';
          if (asset) await asset.decode().catch(() => {});
          const defects = [];
          const testText = selector => {
            const element = document.querySelector(selector);
            if (!element?.textContent.trim()) return null;
            const r = element.getBoundingClientRect();
            if (r.left < 60 || r.right > 1020 || r.top < 80 || r.bottom > 1800) defects.push([selector === '.caption' ? 'caption_safe_area' : 'text_safe_area', selector]);
            if (element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2) defects.push(['text_overflow',selector]);
            return r;
          };
          const headline = testText('.headline');
          const detail = testText('.detail');
          const caption = testText('.caption');
          if (!headline) defects.push(['empty_scene','Missing headline']);
          const overlap=(a,b)=>a && b && a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
          if (overlap(headline,caption) || overlap(detail,caption)) defects.push(['text_overlap','Editorial text covers captions']);
          const box=asset?.getBoundingClientRect();
          const visible=!!(asset?.naturalWidth && box.width>0 && box.height>0 && box.left>=0 && box.right<=1080 && box.top>=0 && box.bottom<=1920 && getComputedStyle(asset).visibility==='visible');
          if (asset && !visible) defects.push(['missing_or_hidden_asset',asset.dataset.assetId || 'unnamed']);
          return {asset:visible ? asset.dataset.assetId : null, label:scene.querySelector('.eyebrow')?.textContent, defects};
        },{seconds,broken:!!injected});
        if (shot.product_asset !== 'none' && snapshot.asset !== shot.product_asset) add('expected_asset_missing',shot.product_asset,{scene,seconds});
        for (const [code,detail] of snapshot.defects) add(code,detail,{scene,seconds});
        const screenshot=stem+'scene-'+scene+'-'+Math.round(fraction*100)+'.png';
        await page.screenshot({path:path.join(output,screenshot)});
        report.samples.push({scene,seconds,screenshot,asset:snapshot.asset,label:snapshot.label});
      }
    }
  } catch(error) {
    report.defects.push({code:'browser_execution',severity:'critical',detail:error.message});
    process.exitCode=1;
  } finally {
    if (browser) await browser.close();
    server.close();
    fs.writeFileSync(path.join(output,stem+'browser_qa.json'),JSON.stringify(report,null,2));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
