import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTextAnimationPlan } from './copilot.ts';
import { addItem } from './timeline/model.ts';
import { createEmptyProject } from './timeline/types.ts';
import { applyEditPlan, calculateProjectRevision } from './timeline/editPlan.ts';

test('animate the text creates a valid update for an existing title', async () => {
  const project=addItem(createEmptyProject(),{id:'title-1',kind:'text',trackId:'text',label:'Hello World',text:'Hello World',startTime:0,duration:3,fontFamily:'Inter',fontSize:44,color:'#ffffff',bold:true,x:.5,y:.5,width:.8,rotation:0,alignment:'center',outlineColor:'#000000',outlineWidth:0,shadow:true,backgroundColor:'#000000',backgroundOpacity:0,inAnimation:'none',outAnimation:'none',loopAnimation:'none',inAnimationDuration:.5,outAnimationDuration:.5});
  const revision=await calculateProjectRevision(project);
  const plan=buildTextAnimationPlan({project,projectRevision:revision,prompt:'Please animate the text also'});
  assert.ok(plan);
  assert.equal(plan.operations[0].op,'update_item');
  const updated=await applyEditPlan(project,plan);
  const title=updated.project.tracks.find(track=>track.id==='text')!.items[0];
  assert.equal(title.kind,'text');
  if(title.kind==='text')assert.equal(title.inAnimation,'fade-in');
});
test('contextual animation ignores unrelated instructions',()=>{assert.equal(buildTextAnimationPlan({project:createEmptyProject(),projectRevision:'x',prompt:'What is a good reel?'}),null)});
