const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createRequire}=require('node:module');
const PHASES=[['entry',.01],['anticipation',.16],['main_action',.42],['peak',.68],['transition_midpoint',.9],['exit',.99]];

async function main(){
 const [workspaceArg,outputArg,injectArg]=process.argv.slice(2),workspace=path.resolve(workspaceArg),output=path.resolve(outputArg),inject=injectArg==='inject';
 const req=createRequire(path.join(workspace,'package.json'));let playwright;try{playwright=req('playwright')}catch{playwright=req('playwright-core')}
 const root=path.join(output,'composition'),plan=JSON.parse(fs.readFileSync(path.join(output,'compiled_motion.json'))),defects=[],samples=[],executed=new Set(),cameraEvidence=[];
 const server=http.createServer((request,response)=>{const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return}fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end();return}response.setHeader('Content-Type',file.endsWith('.html')?'text/html':/\.(m?js)$/.test(file)?'text/javascript':'application/octet-stream');response.end(data)})});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});let browser;
 const add=(code,detail,extra={})=>defects.push({code,detail,severity:'high',...extra});
 try{
  browser=await playwright.chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1080,height:1920}});
  page.on('pageerror',error=>add('javascript_error',error.message));page.on('requestfailed',request=>add('resource_failure',request.url()));
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.waitForFunction(()=>typeof window.__jackInspect==='function');
  if(inject){await page.addStyleTag({content:'#caption{left:-260px!important}.label{max-height:9px!important;overflow:hidden!important}'});await page.evaluate(()=>{const original=window.__jackInspect;window.__jackInspect=time=>{const state=original(time);state.blank=true;if(state.geometry[0])state.geometry[0].left=-180;if(time>2)state.camera.position[0]+=40;return state;};});}
  for(let index=0;index<plan.scenes.length;index++){
   const scene=plan.scenes[index],positions=[];
   for(const [phase,fraction] of PHASES){
    const frame=Math.min(scene.end_frame-1,Math.max(scene.start_frame,Math.round(scene.start_frame+(scene.end_frame-scene.start_frame-1)*fraction))),seconds=frame/30;
    const result=await page.evaluate(seconds=>{const state=window.__jackInspect(seconds),issues=[],main=document.querySelector('#main').getBoundingClientRect(),boxes=[...document.querySelectorAll('#title,#caption,.label')].filter(element=>!element.hidden&&element.textContent.trim()).map(element=>{const r=element.getBoundingClientRect();return {name:element.id||'label',left:r.left-main.left,right:r.right-main.left,top:r.top-main.top,bottom:r.bottom-main.top,overflow:element.scrollHeight>element.clientHeight+2||element.scrollWidth>element.clientWidth+2}});return {state,boxes};},seconds);
    const state=result.state;for(const action of state.activeActions)executed.add(action.action);positions.push(state.camera.position);
    if(state.blank)add('blank_frame','No intended subject is visible',{scene:index,phase,seconds});
    if(state.visibleIds.some(id=>!scene.active_ids.includes(id)))add('subject_visibility','An unplanned subject is visible',{scene:index,phase,seconds});
    const intentionalTransitionExit=['entry','exit'].includes(phase)&&state.transition.strength>.1&&['directional','occlusion','spatial'].includes(scene.transition);
    for(const box of state.geometry){if(!intentionalTransitionExit&&(!Object.values(box).filter(value=>typeof value==='number').every(Number.isFinite)||box.left<45||box.right>1035||box.top<315||box.bottom>1535))add('geometry_bounds',box.id,{scene:index,phase,seconds});}
    for(const box of result.boxes){if(box.left<60||box.right>1020||box.top<70||box.bottom>1830)add('text_safe_area',box.name,{scene:index,phase,seconds});if(box.overflow)add('text_overflow',box.name,{scene:index,phase,seconds});}
    if(scene.transition!=='cut'&&(phase==='entry'||phase==='exit')&&state.transition.strength<.1)add('transition_missing',scene.transition,{scene:index,phase,seconds});
    const screenshot=(inject?'injected-':'')+`scene-${index}-${phase}.png`;await page.screenshot({path:path.join(output,screenshot)});samples.push({scene:index,phase,seconds,screenshot,state});
   }
   let maxStep=0,maxAcceleration=0,previousStep=null,previous=null;
   for(let frame=scene.start_frame;frame<scene.end_frame;frame++){const camera=await page.evaluate(seconds=>window.__jackInspect(seconds).camera.position,frame/30);if(previous){const step=Math.hypot(...camera.map((value,i)=>value-previous[i]));maxStep=Math.max(maxStep,step);if(previousStep!==null)maxAcceleration=Math.max(maxAcceleration,Math.abs(step-previousStep));previousStep=step;}previous=camera;}
   cameraEvidence.push({scene:index,transition:scene.transition,max_step:maxStep,max_acceleration:maxAcceleration});
   if(maxStep>.35)add('camera_discontinuity',`maximum step ${maxStep.toFixed(3)}`,{scene:index});
   if(maxAcceleration>.22)add('camera_acceleration',`maximum acceleration ${maxAcceleration.toFixed(3)}`,{scene:index});
  }
 }finally{if(browser)await browser.close();server.close();}
 const report={scope:'actual WebGL geometry, DOM, motion events, transitions and camera samples',injected:inject,defects,samples,executed_actions:[...executed].sort(),camera_continuity:cameraEvidence};fs.writeFileSync(path.join(output,inject?'injected_browser_qa.json':'browser_qa.json'),JSON.stringify(report,null,2));if(!inject&&defects.length)process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=1});
