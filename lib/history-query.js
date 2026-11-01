const jsonField=field=>`CASE WHEN JSON_VALID(l.details) THEN JSON_UNQUOTE(JSON_EXTRACT(l.details, '$.${field}')) ELSE NULL END`;
const snapshotGame=`NULLIF(${jsonField('game')}, '')`;
const snapshotEmulator=`NULLIF(${jsonField('emulator')}, '')`;
const snapshotName=`NULLIF(${jsonField('name')}, '')`;
const snapshotKind=jsonField('kind');
const gameName=`COALESCE(${snapshotGame}, g.name, CASE WHEN target_entry.kind='game' THEN target_entry.name END, CASE WHEN ${snapshotKind}='game' THEN ${snapshotName} END)`;
const emulatorName=`COALESCE(${snapshotEmulator}, em.name, CASE WHEN target_entry.kind='emulator' THEN target_entry.name END, CASE WHEN ${snapshotKind}='emulator' THEN ${snapshotName} END)`;
const sorts={newest:'l.id DESC',oldest:'l.id ASC',game:'history_game IS NULL, history_game ASC, l.id DESC',emulator:'history_emulator IS NULL, history_emulator ASC, l.id DESC'};
function value(input){if(input===undefined)return '';if(typeof input!=='string'||input.length>100){const error=new Error('History search must be text of at most 100 characters');error.status=400;throw error}return input.trim();}
function pattern(input){return `%${input.replace(/[!%_]/g,'!$&')}%`;}

export function historyQuery(params,pagination){
  const game=value(params.game),emulator=value(params.emulator),sort=params.sort===undefined?'newest':params.sort;
  if(typeof sort!=='string'||!Object.hasOwn(sorts,sort)){const error=new Error('Invalid history sort');error.status=400;throw error}
  const conditions=[],args=[];
  if(game){conditions.push(`LOWER(${gameName}) LIKE LOWER(?) ESCAPE '!'`);args.push(pattern(game));}
  if(emulator){conditions.push(`LOWER(${emulatorName}) LIKE LOWER(?) ESCAPE '!'`);args.push(pattern(emulator));}
  const sql=`SELECT l.*,u.display_name admin_name,g.name game_name,em.name emulator_name,tester.display_name tester_name,r.result report_result,r.revision report_revision,target_entry.name entry_name,target_entry.kind entry_kind,target_user.display_name target_user_name,${gameName} history_game,${emulatorName} history_emulator FROM moderation_log l JOIN users u ON u.id=l.admin_id LEFT JOIN flags f ON l.target_type='flag' AND f.id=l.target_id LEFT JOIN reports r ON r.id=CASE WHEN l.target_type='report' THEN l.target_id WHEN l.target_type='flag' THEN f.report_id END LEFT JOIN entries g ON g.id=r.game_id LEFT JOIN entries em ON em.id=r.emulator_id LEFT JOIN users tester ON tester.id=r.user_id LEFT JOIN entries target_entry ON l.target_type='entry' AND target_entry.id=l.target_id LEFT JOIN users target_user ON l.target_type='user' AND target_user.id=l.target_id${conditions.length?' WHERE '+conditions.join(' AND '):''} ORDER BY ${sorts[sort]} ${pagination.sql}`;
  return {sql,args};
}
