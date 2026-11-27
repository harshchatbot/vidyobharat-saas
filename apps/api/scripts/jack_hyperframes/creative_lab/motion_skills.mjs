import * as T from './vendor/three.module.js';

export const skills=['reveal','move','scale','rotate','fade','hold','assemble','disassemble','transform','path','data_flow','dissolve','reassemble','explode','stagger','unlock'];
export const lighting={
  studio:{key:2.4,fill:1.1,rim:1.5,ambient:.75,exposure:1.02},
  dramatic:{key:3.0,fill:.35,rim:2.2,ambient:.42,exposure:.9},
  technical:{key:1.8,fill:1.4,rim:1.0,ambient:.85,exposure:1.0},
  warm:{key:2.5,fill:.9,rim:1.25,ambient:.7,exposure:1.06},
  product:{key:2.9,fill:1.3,rim:1.8,ambient:.78,exposure:1.0}
};
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const x=clamp(value);return x*x*(3-2*x)};
const mix=(a,b,u)=>a+(b-a)*u;

export function studio(scene,renderer){
  const key=new T.DirectionalLight(0xffe2c4),fill=new T.DirectionalLight(0xaed5ff),rim=new T.DirectionalLight(0xffa66f);
  key.position.set(4,6,5);fill.position.set(-4,2,4);rim.position.set(1,4,-5);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.near=.1;key.shadow.camera.far=30;
  const ambient=new T.HemisphereLight(0xddeeff,0x1b2638,.75);
  scene.add(key,fill,rim,ambient);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const ground=new T.Mesh(new T.PlaneGeometry(22,22),new T.ShadowMaterial({color:0x05070b,opacity:.28}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-2.2;ground.receiveShadow=true;scene.add(ground);
  return name=>{const preset=lighting[name]||lighting.studio;key.intensity=preset.key;fill.intensity=preset.fill;rim.intensity=preset.rim;ambient.intensity=preset.ambient;renderer.toneMappingExposure=preset.exposure;};
}

export function object(kind,color,label='Illustration'){
  const group=new T.Group(),parts=[];
  const base=new T.MeshStandardMaterial({color,roughness:.32,metalness:.28});
  const accent=new T.MeshStandardMaterial({color:new T.Color(color).offsetHSL(.06,.05,.14),roughness:.25,metalness:.38,emissive:new T.Color(color).multiplyScalar(.08)});
  const add=(geometry,x,y,z,material=base)=>{const mesh=new T.Mesh(geometry,material.clone());mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);parts.push({mesh,home:mesh.position.clone(),seed:parts.length});return mesh;};
  if(kind==='document')for(let i=0;i<5;i++)add(new T.BoxGeometry(2.1,1.4,.055),0,0,i*.08);
  else if(kind==='computer'){add(new T.BoxGeometry(2.6,1.65,.18),0,0,0);add(new T.BoxGeometry(2.4,1.45,.04),0,0,.12,accent);add(new T.BoxGeometry(.25,.7,.25),0,-1.1,0);add(new T.BoxGeometry(1.4,.12,.7),0,-1.45,0);}
  else if(kind==='bars'||kind==='chart')[.7,1.1,1.7,2.3].forEach((height,index)=>add(new T.BoxGeometry(.48,height,.55),(index-1.5)*.65,height/2-1,0,index===3?accent:base));
  else if(kind==='node')for(let i=0;i<12;i++){const angle=i*2.39996;add(new T.SphereGeometry(.13,12,8),Math.cos(angle)*.9,Math.sin(angle)*.9,(i%3-1)*.4,i%3===0?accent:base);}
  else if(kind==='database')for(let i=0;i<3;i++)add(new T.CylinderGeometry(.85,.85,.4,32),0,(i-1)*.48,0,i===1?accent:base);
  else if(['panel','text','repository'].includes(kind))add(new T.BoxGeometry(2.2,1.35,.12),0,0,0);
  else if(kind==='model')add(new T.IcosahedronGeometry(.85,2),0,0,0,accent);
  else if(kind==='key'){add(new T.TorusGeometry(.38,.1,12,24),-.6,0,0,accent);add(new T.BoxGeometry(1.1,.16,.16),.15,0,0);}
  else if(kind==='vault'){add(new T.BoxGeometry(1.6,1.6,.8),0,0,0);add(new T.TorusGeometry(.45,.09,12,24),0,0,.45,accent);}
  else if(kind==='connector')add(new T.BoxGeometry(1.8,.08,.08),0,0,0,accent);
  else if(kind==='pipeline'){for(let i=0;i<3;i++)add(new T.BoxGeometry(.8,.8,.8),(i-1)*1.35,0,0,i===1?accent:base);for(let i=0;i<2;i++)add(new T.BoxGeometry(.58,.08,.08),(i-.5)*1.35,0,0,accent);}
  else if(kind==='product'){add(new T.BoxGeometry(1.45,1.05,.8),0,0,0,accent);for(let i=0;i<8;i++){const angle=i*Math.PI/4;add(new T.BoxGeometry(.42,.28,.35),Math.cos(angle)*.95,Math.sin(angle)*.75,(i%2-.5)*.55,base);}}
  else if(kind==='particle_field'){for(let i=0;i<36;i++){const angle=i*2.39996,radius=.2+.035*i;add(new T.SphereGeometry(.055,8,6),Math.cos(angle)*radius,Math.sin(angle)*radius,(i%5-2)*.12,i%4===0?accent:base);}}
  else throw Error('Unsupported geometry '+kind);
  if(['document','panel','repository','text','computer'].includes(kind)){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=480;const ctx=canvas.getContext('2d');ctx.fillStyle='#eef3f8';ctx.fillRect(0,0,768,480);ctx.fillStyle='#203750';ctx.font='bold 34px sans-serif';ctx.fillText(String(label).slice(0,32),36,68,690);ctx.font='20px sans-serif';ctx.fillText('CONCEPTUAL ILLUSTRATION',36,106);for(let i=0;i<5;i++){ctx.fillStyle=i===0?'#4f86a8':'#a9bac8';ctx.fillRect(36,155+i*52,540-(i%3)*95,14);}const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;add(new T.PlaneGeometry(kind==='computer'?2.3:2,1.25),0,0,kind==='document'?.38:kind==='computer'?.15:.07,new T.MeshBasicMaterial({map:texture}));
  }
  if(parts.length>64)throw Error('Object exceeds part budget');
  return {group,parts,kind};
}

export function applyTrack(entry,track,frame){
  const span=Math.max(1,track.end_frame-track.start_frame),raw=clamp((frame-track.start_frame)/span);
  const anticipation=track.anticipation||0,follow=track.followThrough||0;
  let amount=smooth(raw);
  const pre=raw<anticipation&&anticipation>0?Math.sin(raw/anticipation*Math.PI)*-.055:0;
  const post=raw>1-follow&&follow>0?Math.sin((raw-(1-follow))/follow*Math.PI)*.035:0;
  amount=clamp(amount+pre+post);
  const from=track.from_position,to=track.to_position;
  entry.group.position.set(...from.map((value,index)=>mix(value,to[index],amount)));
  if(track.pathArc)entry.group.position.y+=Math.sin(Math.PI*amount)*track.pathArc;
  const scale=mix(track.from_scale,track.to_scale,amount)*(1+pre*.8+post*.5)*.78;entry.group.scale.setScalar(scale);
  entry.group.rotation.y=mix(track.rotationFrom,track.rotationTo,amount);
  const opacity=mix(track.from_opacity,track.to_opacity,amount),spread=mix(track.spreadFrom,track.spreadTo,amount);
  const morph=mix(track.morphFrom,track.morphTo,amount),flow=mix(track.flowFrom,track.flowTo,amount),particle=mix(track.particleFrom,track.particleTo,amount),stagger=mix(track.staggerFrom,track.staggerTo,amount);
  entry.parts.forEach(({mesh,home,seed},index)=>{
    const delay=track.action==='stagger'?clamp(amount*1.6-index/Math.max(1,entry.parts.length)*.6):amount;
    mesh.position.copy(home);const centered=index-(entry.parts.length-1)/2,particleField=entry.kind==='particle_field';
    mesh.position.x+=centered*(particleField?.05:.34)*spread;mesh.position.y+=Math.cos(index*2.1)*(particleField?.18:.42)*spread;mesh.position.z+=Math.sin(index*2)*(particleField?.28:.68)*spread;
    if(track.action==='data_flow'||entry.kind==='particle_field'){const phase=(flow+index/entry.parts.length)%1;mesh.position.x+=Math.sin(phase*Math.PI*2)*.22;mesh.position.y+=Math.cos(phase*Math.PI*2)*.14;}
    mesh.scale.set(1+(.25*Math.sin((index+1)*1.7))*morph,1-.18*morph,1+.12*morph);
    mesh.rotation.z=morph*(index%2?-.35:.35);mesh.visible=opacity>.01&&particle<.995;
    mesh.material.transparent=true;mesh.material.opacity=opacity*(1-particle*.75)*(.65+.35*delay);
    if('emissiveIntensity' in mesh.material)mesh.material.emissiveIntensity=.08+.45*Math.max(0,Math.sin((flow+seed*.12)*Math.PI*2));
  });
  entry.group.visible=opacity>.01;
  return {amount,opacity,spread,morph,flow,particle,stagger};
}
