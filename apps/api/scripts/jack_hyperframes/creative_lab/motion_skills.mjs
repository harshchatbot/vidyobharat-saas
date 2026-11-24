import * as T from './vendor/three.module.js';
export const skills=['reveal','move','scale','rotate','fade','hold','assemble','disassemble'];
export const lighting={studio:[2.8,1.1,1.6],dramatic:[3.5,.4,2.8],technical:[2,1.8,1.2]};
export function studio(scene,renderer){
 const lights=[new T.DirectionalLight(0xffe5cd),new T.DirectionalLight(0xbad8ff),new T.DirectionalLight(0xffbd85)];
 [[3,5,5],[-4,2,3],[1,3,-5]].forEach((p,i)=>{lights[i].position.set(...p);scene.add(lights[i]);});
 scene.add(new T.HemisphereLight(0xe0edff,0x28354a,1.2));renderer.shadowMap.enabled=true;lights[0].castShadow=true;lights[0].shadow.mapSize.set(1024,1024);
 return name=>{if(!lighting[name])throw Error('Unknown lighting');lights.forEach((l,i)=>l.intensity=lighting[name][i]);};
}
export function object(kind,color){
 const group=new T.Group(),mat=new T.MeshStandardMaterial({color,roughness:.38,metalness:.22});
 const parts=[];
 const add=(g,x,y,z,m=mat)=>{const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);parts.push({mesh,home:mesh.position.clone()});};
 if(kind==='document'){for(let i=0;i<5;i++)add(new T.BoxGeometry(2.1,1.4,.055),0,0,i*.08);}
 else if(kind==='computer'){add(new T.BoxGeometry(2.6,1.65,.18),0,0,0);add(new T.BoxGeometry(2.4,1.45,.04),0,0,.12,new T.MeshStandardMaterial({color:0x142a40}));add(new T.BoxGeometry(.25,.7,.25),0,-1.1,0);add(new T.BoxGeometry(1.4,.12,.7),0,-1.45,0);}
 else if(kind==='bars'){[.7,1.1,1.7,2.3].forEach((h,i)=>add(new T.BoxGeometry(.48,h,.55),(i-1.5)*.65,h/2-1,0));}
 else if(kind==='node'){for(let i=0;i<12;i++){let a=i*2.39996;add(new T.SphereGeometry(.13,16,12),Math.cos(a)*.9,Math.sin(a)*.9,(i%3-1)*.4);}}
 else if(kind==='database'){for(let i=0;i<3;i++)add(new T.CylinderGeometry(.85,.85,.4,48),0,(i-1)*.48,0);}
 else if(['panel','text','repository'].includes(kind)){add(new T.BoxGeometry(2.2,1.35,.12),0,0,0);}
 else if(kind==='model'){add(new T.IcosahedronGeometry(.85,1),0,0,0);}
 else if(kind==='key'){add(new T.TorusGeometry(.38,.1,16,32),-.6,0,0);add(new T.BoxGeometry(1.1,.16,.16),.15,0,0);}
 else if(kind==='vault'){add(new T.BoxGeometry(1.6,1.6,.8),0,0,0);add(new T.TorusGeometry(.45,.09,16,32),0,0,.45);}
 else if(kind==='connector'){add(new T.BoxGeometry(1.8,.08,.08),0,0,0);}
 else throw Error('Unsupported geometry '+kind);
 return {group,parts};
}
const clamp=x=>Math.max(0,Math.min(1,x));
export function apply(o,a,t){
 if(!skills.includes(a.skill))throw Error('Unsupported skill '+a.skill);
 const u=gsap.parseEase('power2.inOut')(clamp(t));
 o.group.position.fromArray(a.from.map((x,i)=>x+(a.to[i]-x)*u));
 o.group.scale.setScalar(a.scaleFrom+(a.scaleTo-a.scaleFrom)*u);
 o.group.rotation.y=a.skill==='rotate'?u*Math.PI*2:0;
 const spread=a.skill==='assemble'?1-u:a.skill==='disassemble'?u:0;
 o.parts.forEach(({mesh,home},i)=>{mesh.position.copy(home);mesh.position.x+=(i-(o.parts.length-1)/2)*.35*spread;mesh.position.z+=Math.sin(i*2)*.65*spread;mesh.position.y+=Math.cos(i*2)*.4*spread;mesh.material.transparent=true;mesh.material.opacity=a.opacityFrom+(a.opacityTo-a.opacityFrom)*u;});
}
export function fit(camera,group,aspect,angle=0){
 group.updateMatrixWorld(true);const box=new T.Box3().setFromObject(group),center=box.getCenter(new T.Vector3()),radius=box.getBoundingSphere(new T.Sphere()).radius;
 const half=Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov/2))*Math.min(1,aspect)*.78);
 const distance=Math.max(3,radius/Math.sin(half));camera.position.set(center.x+Math.sin(angle)*distance,center.y+.12*distance,center.z+Math.cos(angle)*distance);camera.lookAt(center);camera.updateMatrixWorld();
}
