const limit=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,80):'';
export function reportSnapshot(row){if(!row)return '';return JSON.stringify({game:limit(row.game_name),emulator:limit(row.emulator_name),tester:limit(row.tester_name),result:limit(row.result),revision:limit(row.revision)});}
export function entrySnapshot(row,summary=''){return JSON.stringify({name:limit(row?.name),kind:limit(row?.kind),summary:limit(summary)});}

export function describeHistory(row){
  let saved={};try{const parsed=JSON.parse(row.details||'');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))saved=parsed}catch{}
  const verb=({approve:'Approved',edit:'Edited',delete:'Deleted',resolve:'Resolved',active:'Reactivated',suspended:'Suspended',banned:'Banned',reject:'Denied'})[row.action]||row.action;
  const game=saved.game||row.game_name,emulator=saved.emulator||row.emulator_name,tester=saved.tester||row.tester_name,result=saved.result||row.report_result,revision=saved.revision||row.report_revision;
  let target='';const context=[];
  if(row.target_type==='report'||row.target_type==='flag'){
    const noun=row.target_type==='flag'?'flag for report':'report';
    target=game||emulator?`${noun}: ${[game,emulator].filter(Boolean).join(' · ')}`:`${noun} #${row.target_id} (details unavailable)`;
    if(tester)context.push(`Tester: ${tester}`);if(result)context.push(`Result: ${result}`);if(revision)context.push(`Revision: ${revision}`);
  }else if(row.target_type==='entry'){
    const name=saved.name||row.entry_name,kind=saved.kind||row.entry_kind||'entry';target=name?`${kind}: ${name}`:`${kind} #${row.target_id} (details unavailable)`;
  }else if(row.target_type==='user'){
    const name=saved.name||row.target_user_name;target=name?`user: ${name}`:`user #${row.target_id} (details unavailable)`;
  }else target=`${row.target_type} #${row.target_id}`;
  if(saved.summary)context.push(saved.summary);else if(row.details&&!Object.keys(saved).length)context.push(row.details);
  return {title:`${verb} ${target}`,context:context.join(' · ')};
}
