// Accept a repository page only; never accept arbitrary API hosts or extra paths.
export function parseGitHubRepository(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/([a-z\d_.-]{1,100})\/?$/i.exec(url.pathname);
    if (!match) return null;
    const owner=match[1],repo=match[2].replace(/\.git$/i,'');
    if (!repo || repo==='.' || repo==='..') return null;
    return {owner,repo,url:`https://github.com/${owner}/${repo}`};
  } catch { return null; }
}

function cleanMarkdown(value){return value.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[*_`~]/g,'').replace(/&(?:middot|#183);/gi,' ').replace(/\s+/g,' ').trim();}

export function readmeMetadata(readme,parsed){
  const lines=readme.slice(0,65536).replace(/\r/g,'').split('\n');let name='',description='',version='',inCode=false,paragraph=[];
  function finishParagraph(){if(!description){const text=cleanMarkdown(paragraph.join(' '));if(text.length>=25&&/[a-z]/i.test(text)&&!/^https?:\/\//i.test(text))description=text.slice(0,1000)}paragraph=[];}
  for(const line of lines){
    if(/^\s*(```|~~~)/.test(line)){finishParagraph();inCode=!inCode;continue}if(inCode)continue;
    if(!name&&/^\s*#\s+/.test(line)){finishParagraph();const title=cleanMarkdown(line.replace(/^\s*#\s+/,''));if(title&&title.length<=180)name=title;continue}
    const match=line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:latest\s+release|latest\s+version|current\s+version|version)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(v?\d[\w.+-]{0,39})/i);
    if(!version&&match)version=match[1];
    if(!line.trim()||match||/^\s*(?:#|[-*+>]\s|\||<|!\[|\[!\[|\[\s*\]|\d+\.|---)/.test(line))finishParagraph();else if(!description)paragraph.push(line);
  }
  finishParagraph();
  // Only suggest images explicitly labelled as logos, and only from this repository.
  let image_url='';const image=readme.slice(0,65536).match(/!\[[^\]]*\blogo\b[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/i);
  if(image){try{const base=`https://raw.githubusercontent.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/HEAD/`;const url=new URL(image[1],base);if(url.origin==='https://raw.githubusercontent.com'&&url.href.startsWith(base)&&/\.(png|jpe?g|webp|svg)(?:\?|$)/i.test(url.href))image_url=url.href}catch{}}
  return {name,description,versions:version,image_url};
}

async function getReadme(root,parsed,signal){
  try{const response=await fetch(root+'/readme',{signal,headers:{Accept:'application/vnd.github.raw+json'}});if(response.ok){const text=await response.text();if(text&&!text.trimStart().startsWith('{'))return text;}}
  catch(error){if(error.name==='AbortError')throw error;}
  const base=`https://raw.githubusercontent.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/HEAD/`;
  for(const file of ['README.md','README.MD','README','README.rst','README.txt']){
    try{const response=await fetch(base+file,{signal});if(response.ok)return await response.text();}catch(error){if(error.name==='AbortError')throw error;}
  }
  return '';
}

export async function githubMetadata(repository, {signal} = {}) {
  const parsed=parseGitHubRepository(repository);
  if (!parsed) throw new Error('Enter a valid GitHub repository URL, such as https://github.com/owner/repository.');
  const root=`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const options={signal,headers:{Accept:'application/vnd.github+json'}};
  let repo=null,version='',releaseUnavailable=false;
  try{const response=await fetch(root,options);if(response.ok)repo=await response.json();}catch(error){if(error.name==='AbortError')throw error;}
  const readme=await getReadme(root,parsed,signal);const readmeInfo=readme?readmeMetadata(readme,parsed):{};
  if(!repo&&!readme)throw new Error('GitHub metadata and README are unavailable. You can enter the information manually.');
  try{const release=await fetch(root+'/releases/latest',options);if(release.ok){const data=await release.json();version=typeof data.tag_name==='string'?data.tag_name.slice(0,3000):'';}else if(release.status!==404)releaseUnavailable=true;}catch(error){if(error.name==='AbortError')throw error;releaseUnavailable=true;}
  const avatar=typeof repo?.owner?.avatar_url==='string' && /^https:\/\/avatars\.githubusercontent\.com\//i.test(repo.owner.avatar_url) ? repo.owner.avatar_url : '';
  const image_url=readmeInfo.image_url||avatar;
  return {name:(repo?.name||readmeInfo.name||parsed.repo).slice(0,180),description:(repo?.description||readmeInfo.description||'').slice(0,5000),image_url,image_attribution:image_url?(readmeInfo.image_url?'Image from the repository README; verify permission and attribution before use.':'GitHub repository owner avatar; verify permission and attribution before use.'):'',versions:version||readmeInfo.versions||'',github_url:parsed.url,releaseUnavailable,readmeUsed:!!readme,metadataUnavailable:!repo};
}
