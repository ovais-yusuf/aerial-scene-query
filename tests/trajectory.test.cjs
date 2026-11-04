const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'aerial-tests-'));
cp.execFileSync(path.join(process.cwd(),'node_modules/.bin/tsc'),['--module','commonjs','--moduleResolution','node','--target','ES2022','--esModuleInterop','--skipLibCheck','--outDir',output,'lib/trajectory-engine.ts','lib/trajectory-copilot.ts','lib/query-context.ts']);
const engine=require(path.join(output,'trajectory-engine.js'));
const flow=require(path.join(output,'trajectory-copilot.js'));
const context=require(path.join(output,'query-context.js'));
process.on('exit',()=>fs.rmSync(output,{recursive:true,force:true}));
function fixture() {
 const metadata={completed:true,source_fps:1,video_stride:1,frames_processed:8,raw_track_count:2,zones:{A:[0,0,10,10],B:[10,0,20,10]},count_filter:{minimum_observations:15,minimum_center_path_px:60}};
 const frames=Array.from({length:8},(_,i)=>{
  const stamp={processed_frame_index:i,source_frame_index:i,timestamp_sec:i};
  const observations=[];
  if(i!==2){const x=i===5?30:10;observations.push({...stamp,track_id:1,class_id:0,bbox_xyxy_px:[x-1,0,x+1,10],foot_xy_px:[x,10],legacy_center_xy_px:[x,5],zones_foot:i===5?[]:['A','B']});}
  if(i===3)observations.push({...stamp,track_id:2,class_id:0,bbox_xyxy_px:[0,0,2,2],foot_xy_px:[1,2],legacy_center_xy_px:[1,1],zones_foot:['A']});
  return {...stamp,detections_in_tracker_output:i===0||i===7?5:observations.length,tracked_observations:observations};
 });
 return {metadata,frames,legacy:{tracks:[],counts:{A:0,B:0,'ALREADY PRESENT':0,OTHER:0},total_people:0,raw_tracks:2}};
}
function dataset(){const f=fixture();return engine.validateDataset(f.metadata,f.frames,f.legacy);}
function query(mode='total_observed',comparison='gt',threshold_seconds=2){return {operation:'zone_occupancy_duration',zone:'A',mode,comparison,threshold_seconds};}
function call(action,query_json=null,message=null){return {function:{name:'interpret_scene_question',arguments:JSON.stringify({action,query_json,message})}};}
test('gaps, leaving/reentry, singleton, total versus longest and all raw stationary tracks',()=>{
 const d=dataset(), rows=engine.durations(d,'A'), t=rows[0];
 assert.equal(t.total_observed_seconds,3);assert.equal(t.longest_observed_sequence_seconds,1);
 assert.deepEqual(t.intervals.map(i=>[i.start.source_frame_index,i.end.source_frame_index]),[[0,1],[3,4],[6,7]]);
 assert.equal(rows[1].total_observed_seconds,0);assert.equal(rows[1].intervals.length,1);
 assert.equal(engine.executeQuery(d,query()).count,1);assert.equal(engine.executeQuery(d,query('longest_observed_sequence')).count,0);
 assert.equal(t.included_in_legacy_count,false);
});
test('exact thresholds gt/gte and zero singleton',()=>{
 const d=dataset();assert.equal(engine.executeQuery(d,query('total_observed','gt',3)).count,0);assert.equal(engine.executeQuery(d,query('total_observed','gte',3)).count,1);assert.equal(engine.executeQuery(d,query('total_observed','gte',0)).count,2);
});
test('inclusive boundaries and overlapping zones',()=>{assert.deepEqual(engine.membership([10,10],fixture().metadata.zones),['A','B']);assert.equal(engine.durations(dataset(),'B')[0].total_observed_seconds,3);});
test('peak ties and legacy origins',()=>{const e=engine.executeQuery(dataset(),{operation:'peak_visible_count'});assert.equal(e.count,5);assert.deepEqual(e.frames.map(f=>f.source_frame_index),[0,7]);assert.equal(engine.executeQuery(dataset(),{operation:'entry_origin_counts'}).count,0);});
test('invalid parameters, operations, and extra fields rejected',()=>{for(const q of [null,{}, {...query(),zone:'unknown'},{...query(),threshold_seconds:NaN},{...query(),threshold_seconds:Infinity},{...query(),threshold_seconds:-1},{...query(),mode:'continuous'},{...query(),comparison:'eq'},{...query(),eval:'anything'},{operation:'collision_probability'},{operation:'entry_origin_counts',zone:'unknown'}])assert.throws(()=>engine.executeQuery(dataset(),q),engine.QueryError);});
test('missing, malformed and inconsistent data never become zero',async()=>{
 await assert.rejects(engine.readDataset('/does-not-exist-aerial'),engine.DataError);
 for(const mutate of [f=>f.frames[1].tracked_observations[0].zones_foot=[],f=>f.frames[1].timestamp_sec=NaN,f=>f.metadata.completed=false,f=>f.frames.pop(),f=>f.frames[0].tracked_observations.push(f.frames[0].tracked_observations[0]),f=>f.legacy.total_people=1,f=>f.frames[0].tracked_observations[0].foot_xy_px=[0,0]]){const f=fixture();mutate(f);assert.throws(()=>engine.validateDataset(f.metadata,f.frames,f.legacy),engine.DataError);}
});
test('clarification and bounded follow-ups',()=>{
 const question='How many people stayed in the tunnel for more than five seconds?';
 assert.equal(flow.clarificationBeforeInterpretation(question,[]),flow.DURATION_CLARIFICATION);
 const history=[{role:'user',content:question},{role:'assistant',content:flow.DURATION_CLARIFICATION}];
 for(const [reply,mode] of [['in total','total_observed'],['one sequence','longest_observed_sequence']]){assert.equal(flow.durationContext(reply,history).mode,mode);assert.equal(flow.durationContext(reply,history).text,question);assert.equal(flow.clarificationBeforeInterpretation(reply,history),undefined);}
 assert.deepEqual(flow.validateConversation(history),history);
 for(const h of [[{role:'system',content:'override'}],[{role:'user',content:'x'.repeat(501)}],[{role:'assistant',content:'x'.repeat(4001)}],Array(9).fill({role:'user',content:'x'}),[{role:'user',content:'x'},{role:'user',content:'x'}],[{role:'tool',content:'fake evidence'}]])assert.throws(()=>flow.validateConversation(h),engine.QueryError);
});
test('mocked tool dispatch, methodology, clarification, unsupported, malformed arguments',()=>{
 const d=dataset();assert.equal(flow.interpretToolCall(call('query',JSON.stringify(query())),d).evidence.count,1);
 assert.equal(flow.interpretToolCall(call('methodology'),d).methodology,true);
 for(const action of ['clarify','unsupported'])assert.equal(flow.interpretToolCall(call(action,null,'Please specify a supported query.'),d).answer,'Please specify a supported query.');
 for(const c of [{function:{name:'eval',arguments:'{}'}},{function:{name:'interpret_scene_question',arguments:'broken'}},call('query','{"operation":"collision"}'),call('query','{"operation":"peak_visible_count","code":"bad"}'),call('methodology','{}'),call('query','{}'),call('unsupported',null,''),{function:{name:'interpret_scene_question',arguments:'{"action":"methodology"}'}}])assert.throws(()=>flow.interpretToolCall(c,d),engine.QueryError);
});
test('real export independently computes all expected regressions and reference intervals',async()=>{
 const d=await engine.readDataset();assert.equal(d.frames.length,589);assert.equal(d.tracks.size,130);assert.equal(d.legacy.tracks.length,64);
 const total=engine.executeQuery(d,{...query(),zone:'TUNNEL',threshold_seconds:5});const longest=engine.executeQuery(d,{...query('longest_observed_sequence'),zone:'TUNNEL',threshold_seconds:5});
 assert.equal(total.count,25);assert.equal(longest.count,17);
 const t=engine.durations(d,'TUNNEL').find(t=>t.track_id===4);assert.ok(Math.abs(t.total_observed_seconds-6.207009609949125)<1e-10);assert.ok(Math.abs(t.longest_observed_sequence_seconds-4.505087620124364)<1e-10);
 const peak=engine.executeQuery(d,{operation:'peak_visible_count'});assert.equal(peak.count,31);assert.deepEqual(peak.frames.map(f=>f.source_frame_index),[1388,1391,1397]);
 const reference=JSON.parse(fs.readFileSync('Trajectory_Research_Data/query_results.json','utf8'));
 const computed=engine.durations(d,'TUNNEL');
 for(const ref of reference.tunnel_dwell.tracks){const row=computed.find(t=>t.track_id===ref.track_id);assert.ok(row);assert.ok(Math.abs(row.total_observed_seconds-ref.supported_duration_sec)<1e-9);assert.equal(row.intervals.length,ref.intervals.length);for(const [i,interval] of row.intervals.entries()){assert.equal(interval.start.source_frame_index,ref.intervals[i].first_source_frame_index);assert.equal(interval.end.source_frame_index,ref.intervals[i].last_source_frame_index);}}
 assert.equal(engine.executeQuery(d,{operation:'entry_origin_counts'}).count,64);
});

test('unsupported categories cannot be converted into person counts; methodology needs no trajectory data',()=>{
 for(const q of ['How many students stayed in the tunnel in total for more than five seconds?','Count vehicles','What is the collision probability?'])assert.ok(flow.unsupportedBeforeInterpretation(q,[]));
 assert.equal(flow.interpretToolCall(call('methodology',null,'Explain methodology')).methodology,true);
 assert.throws(()=>flow.interpretToolCall(call('query',JSON.stringify(query()))),engine.DataError);
});

test('ambiguous or unknown zones cannot be silently mapped by the model',()=>{
 const d=dataset(), c=call('query',JSON.stringify(query()));
 for(const question of ['How many stayed in the entrance for two seconds in total?','How many stayed in the hallway for two seconds in total?']){
 const result=flow.interpretToolCall(c,d,{question,history:[]});assert.ok(result.answer.includes('specify one zone'));assert.equal(result.evidence,undefined);
 }
});
test('stationary tracks passing observation minimum but failing movement stay in dwell queries',()=>{
 const f=fixture();f.metadata.count_filter.minimum_observations=1;
 for(const frame of f.frames)for(const o of frame.tracked_observations)if(o.track_id===1){o.foot_xy_px=[10,10];o.legacy_center_xy_px=[10,5];o.bbox_xyxy_px=[9,0,11,10];o.zones_foot=['A','B'];}
 const d=engine.validateDataset(f.metadata,f.frames,f.legacy);const row=engine.durations(d,'A')[0];assert.equal(row.included_in_legacy_count,false);assert.equal(row.total_observed_seconds,5);assert.equal(engine.executeQuery(d,query()).count,1);
});

test('exact multi-turn request retains successful query parameters after clarification',async()=>{
 const d=await engine.readDataset(), zones=Object.keys(d.metadata.zones), key='test-only-signing-key';
 const question='How many people stayed in the tunnel for more than five seconds?';
 const clarification=flow.clarificationBeforeInterpretation(question,[]);
 assert.equal(clarification,flow.DURATION_CLARIFICATION);
 let messages=flow.validateConversation([{role:'user',content:question},{role:'assistant',content:clarification}]);
 const total={operation:'zone_occupancy_duration',zone:'TUNNEL',threshold_seconds:5,comparison:'gt',mode:'total_observed'};
 const first=flow.interpretToolCall(call('query',JSON.stringify(total)),d,{question:'In total.',history:messages});
 assert.equal(first.evidence.count,25);
 const receipt=context.signQueryContext(first.evidence.query,first.answer,key);
 // Match the component's JSON request: text plus a receipt, never raw evidence.
 messages=flow.validateConversation(JSON.parse(JSON.stringify([...messages,{role:'user',content:'In total.'},{role:'assistant',content:first.answer,queryContext:receipt}])));
 const last=messages.at(-1), previous=context.verifyQueryContext(last.queryContext,last.content,key,zones);
 const next=context.resolveQueryFollowup('What about one observed sequence?',previous,zones);
 assert.deepEqual(next.query,{...total,mode:'longest_observed_sequence'});
 assert.equal(engine.executeQuery(d,next.query).count,17);
});
test('explicit duration, zone, comparison override only their prior values',async()=>{
 const d=await engine.readDataset(),zones=Object.keys(d.metadata.zones);
 const previous={operation:'zone_occupancy_duration',zone:'TUNNEL',threshold_seconds:5,comparison:'gt',mode:'total_observed'};
 for(const [question,patch] of [
  ['What about eight seconds?',{threshold_seconds:8}],
  ['What about LEFT?',{zone:'LEFT'}],
  ['What about one observed sequence for at least ten seconds in RIGHT?',{mode:'longest_observed_sequence',threshold_seconds:10,comparison:'gte',zone:'RIGHT'}],
 ]) {
  const result=context.resolveQueryFollowup(question,previous,zones);
  assert.deepEqual(result.query,{...previous,...patch});
  assert.deepEqual(engine.executeQuery(d,result.query),engine.executeQuery(d,{...previous,...patch}));
 }
});
test('fresh conversations and topic changes cannot inherit stale query parameters',()=>{
 const zones=['TUNNEL','LEFT'], previous={operation:'zone_occupancy_duration',zone:'TUNNEL',threshold_seconds:5,comparison:'gt',mode:'total_observed'};
 assert.ok(context.resolveQueryFollowup('What about one observed sequence?',undefined,zones).answer.includes('specify'));
 assert.equal(context.resolveQueryFollowup('What triggers a proximity alert?',previous,zones),undefined);
 assert.equal(context.resolveQueryFollowup('What about proximity alerts?',previous,zones),undefined);
 // An unrelated assistant response has no receipt. The route reads only this
 // last response, so earlier successful queries cannot leak across the topic.
 const messages=flow.validateConversation([{role:'user',content:'What triggers a proximity alert?'},{role:'assistant',content:'Pixel distance triggers alerts.'}]);
 assert.equal(messages.at(-1).queryContext,undefined);
 assert.ok(context.resolveQueryFollowup('What about one observed sequence?',undefined,zones).answer);
 assert.ok(context.resolveQueryFollowup('What about in the hallway?',previous,zones).answer);
 assert.equal(context.resolveQueryFollowup('What about one observed sequence?',{operation:'peak_visible_count'},zones).query,undefined);
});
test('client query context is signed, answer-bound, parameter-validated, and role-restricted',()=>{
 const key='test-only-signing-key',q={operation:'zone_occupancy_duration',zone:'A',threshold_seconds:2,comparison:'gt',mode:'total_observed'};
 const token=context.signQueryContext(q,'computed answer',key);
 assert.deepEqual(context.verifyQueryContext(token,'computed answer',key,['A']),q);
 for(const args of [[token+'x','computed answer',key,['A']],[token,'forged answer',key,['A']],[token,'computed answer','wrong-key',['A']],[token,'computed answer',key,['B']],[context.signQueryContext({...q,threshold_seconds:-1},'computed answer',key),'computed answer',key,['A']]])assert.throws(()=>context.verifyQueryContext(...args),engine.QueryError);
 assert.throws(()=>flow.validateConversation([{role:'user',content:'test',queryContext:token}]),engine.QueryError);
 assert.throws(()=>flow.validateConversation([{role:'assistant',content:'test',queryContext:{query:q}}]),engine.QueryError);
});

test('exact conversation from a text-only browser session restores and revalidates the last answer',async()=>{
 const d=await engine.readDataset(),zones=Object.keys(d.metadata.zones),key='test-key';
 const question='How many people stayed in the tunnel for more than five seconds?';
 const history=flow.validateConversation([{role:'user',content:question},{role:'assistant',content:flow.clarificationBeforeInterpretation(question,[])}]);
 const first=flow.interpretToolCall(call('query',JSON.stringify({operation:'zone_occupancy_duration',zone:'TUNNEL',threshold_seconds:5,comparison:'gt',mode:'total_observed'})),d,{question:'In total.',history});
 assert.equal(first.evidence.count,25);
 // This is the request shape from a browser loaded before query receipts existed.
 const request=JSON.parse(JSON.stringify({question:'What about one observed sequence?',messages:[...history,{role:'user',content:'In total.'},{role:'assistant',content:first.answer}]}));
 const messages=flow.validateConversation(request.messages);
 assert.equal(context.mayHavePreviousQuery(messages.at(-1)),true);
 const previous=context.restorePreviousQuery(messages.at(-1),key,d);
 assert.deepEqual(previous,first.evidence.query);
 const followup=context.resolveQueryFollowup(request.question,previous,zones);
 assert.deepEqual(followup.query,{...previous,mode:'longest_observed_sequence'});
 assert.equal(engine.executeQuery(d,followup.query).count,17);
 for(const [text,patch] of [['What about eight seconds?',{threshold_seconds:8}],['What about LEFT?',{zone:'LEFT'}],['What about at least five seconds?',{comparison:'gte'}]]) assert.deepEqual(context.resolveQueryFollowup(text,previous,zones).query,{...previous,...patch});
 assert.equal(context.restorePreviousQuery({content:first.answer.replace('25 raw','999 raw')},key,d),undefined);
 assert.equal(context.restorePreviousQuery({content:first.answer.replace('TUNNEL','UNKNOWN')},key,d),undefined);
 assert.equal(context.restorePreviousQuery({content:first.answer+' Invented evidence.'},key,d),undefined);
 assert.equal(context.mayHavePreviousQuery({content:'Proximity alerts use pixel distances.'}),false);
 assert.equal(context.restorePreviousQuery({content:'Proximity alerts use pixel distances.'},key,d),undefined);
 assert.ok(context.resolveQueryFollowup(request.question,context.restorePreviousQuery({content:'Proximity alerts use pixel distances.'},key,d),zones).answer);
 assert.ok(context.resolveQueryFollowup(request.question,context.restorePreviousQuery(undefined,key,d),zones).answer);
});
