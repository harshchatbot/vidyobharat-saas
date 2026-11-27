// Deterministic animation controller for an approved, externally supplied rig.
export function characterController(T, gltf, manifest) {
  const root = gltf.scene;
  const mixer = new T.AnimationMixer(root);
  const clips = new Map(gltf.animations.map(c => [c.name,c]));
  const actions = {};
  for (const [role,name] of Object.entries(manifest.clips)) {
    if (!clips.has(name)) throw Error("Missing character animation: "+name);
    actions[role]=mixer.clipAction(clips.get(name));
  }
  if (!actions.idle) throw Error("Character requires idle animation");
  const bones = new Map(), morphs=[];
  root.traverse(o=>{
    if(o.isBone) bones.set(o.name,o);
    if(o.morphTargetDictionary && o.morphTargetInfluences) morphs.push(o);
  });
  const hair=(manifest.hair_bones||[]).map(name=>{
    const bone=bones.get(name);
    if(!bone) throw Error("Missing hair bone: "+name);
    return {bone,rest:bone.quaternion.clone()};
  });
  const mouth=manifest.mouth_morph;
  if(!mouth || !morphs.some(o=>mouth in o.morphTargetDictionary)) throw Error("Missing mouth morph");
  const axis=new T.Vector3(0,0,1);
  const q=new T.Quaternion();
  function draw(t,role,localTime,amplitude=0,expression=null) {
    const action=actions[role]||actions.idle;
    mixer.stopAllAction();
    action.reset().play();
    mixer.setTime(Math.max(0,localTime));
    for(const [i,h] of hair.entries()){
      q.setFromAxisAngle(axis,.055*Math.sin(t*3.2+i*.6));
      h.bone.quaternion.copy(h.rest).multiply(q);
    }
    for(const o of morphs){
      const d=o.morphTargetDictionary;
      if(mouth in d)o.morphTargetInfluences[d[mouth]]=Math.max(0,Math.min(1,amplitude));
      for(const [key,name] of Object.entries(manifest.expressions||{})){
        if(name in d)o.morphTargetInfluences[d[name]]=key===expression?.name?Math.max(0,Math.min(1,expression.weight)):0;
      }
    }
  }
  return {root,draw};
}
