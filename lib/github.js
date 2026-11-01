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

export async function githubMetadata(repository, {signal} = {}) {
  const parsed=parseGitHubRepository(repository);
  if (!parsed) throw new Error('Enter a valid GitHub repository URL, such as https://github.com/owner/repository.');
  const root=`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const options={signal,headers:{Accept:'application/vnd.github+json'}};
  const response=await fetch(root,options);
  if (!response.ok) throw new Error('GitHub metadata is unavailable. You can enter the information manually.');
  const repo=await response.json();
  let version='',releaseUnavailable=false;
  try {
    const release=await fetch(root+'/releases/latest',options);
    if (release.ok) {const data=await release.json();version=typeof data.tag_name==='string'?data.tag_name.slice(0,3000):'';}
    else if (release.status!==404) releaseUnavailable=true;
  } catch (error) {if(error.name==='AbortError')throw error;releaseUnavailable=true;}
  const avatar=typeof repo.owner?.avatar_url==='string' && /^https:\/\/avatars\.githubusercontent\.com\//i.test(repo.owner.avatar_url) ? repo.owner.avatar_url : '';
  return {name:typeof repo.name==='string'?repo.name.slice(0,180):'',description:typeof repo.description==='string'?repo.description.slice(0,5000):'',image_url:avatar,image_attribution:avatar?'GitHub repository owner avatar; verify permission and attribution before use.':'',versions:version,github_url:parsed.url,releaseUnavailable};
}
