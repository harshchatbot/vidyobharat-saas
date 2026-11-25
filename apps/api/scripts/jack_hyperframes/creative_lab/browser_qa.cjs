const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createRequire}=require('node:module');
async function main(){
 const [workspace,output]=process.argv.slice(2).map(x=>path.resolve(x));
 const req=createRequire(path.join(workspace,'package.json'));
 let pw;try{pw=req('playwright')}catch{pw=req('playwright-core')}
 const root=path.join(output,'composition'),plan=JSON.parse(fs.readFileSync(path.join(output,'compiled_motion.json')));
 const server=http.createServer((q,res)=>{const f=path.resolve(root,'.'+new URL(q.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(f,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',f.endsWith('.html')?'text/html':/\.(m?js)$/.test(f)?'text/javascript':'application/octet-stream');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;const defects=[];
 try{
 browser=await pw.chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1080,height:1920}});
 page.on('pageerror',e=>defects.push({severity:'critical',scene:0,issue:String(e)}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.waitForFunction(()=>typeof window.__jackInspect==='function');
 for(let i=0;i<plan.scenes.length;i++){
 const s=plan.scenes[i];
 for(const fraction of [.1,.5,.9]){
 const t=(s.start_frame+(s.end_frame-s.start_frame)*fraction)/30;
 const issues=await page.evaluate(t=>{
 const state=window.__jackInspect(t),issues=[];
 const boxes=[...document.querySelectorAll('#title,#caption,.label')].filter(e=>!e.hidden&&e.textContent.trim()).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
 const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 for(const b of boxes)if(b.left<60||b.right>1020||b.top<80||b.bottom>1800)issues.push('Text outside safe area');
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(overlap(boxes[i],boxes[j]))issues.push('Text overlap');
 for(const b of state.geometry)if(!Object.values(b).every(Number.isFinite)||b.left<60||b.right>1020||b.top<350||b.bottom>1500)issues.push('Geometry outside safe area');
 for(let i=0;i<state.geometry.length;i++)for(let j=i+1;j<state.geometry.length;j++)if(overlap(state.geometry[i],state.geometry[j]))issues.push('Projected geometry overlap');
 return issues;
 },t);
 for(const issue of issues)defects.push({scene:i,time:t,severity:'high',issue});
 }
 }
 }finally{if(browser)await browser.close();server.close()}
 fs.writeFileSync(path.join(output,'browser_qa.json'),JSON.stringify({scope:'sampled browser geometry and DOM',defects},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
