import {createRemoteJWKSet,jwtVerify} from 'jose';
const jwks=process.env.TASKUI_JWKS_URL?createRemoteJWKSet(new URL(process.env.TASKUI_JWKS_URL)):null;
export const oauthReady=()=>Boolean(jwks&&process.env.TASKUI_OAUTH_ISSUER&&process.env.TASKUI_OAUTH_AUDIENCE&&process.env.TASKUI_OWNER_SUBJECT&&process.env.TASKUI_PUBLIC_URL);
export async function authenticate(req){
  if(!oauthReady())return null;
  const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'');if(!match)return null;
  try{const {payload}=await jwtVerify(match[1],jwks,{issuer:process.env.TASKUI_OAUTH_ISSUER,audience:process.env.TASKUI_OAUTH_AUDIENCE,algorithms:['RS256','ES256']});
    if(!payload.exp||payload.sub!==process.env.TASKUI_OWNER_SUBJECT)return null;
    const scope=new Set(typeof payload.scope==='string'?payload.scope.split(' '):[]);
    return {subject:payload.sub,read:scope.has('taskui:read'),write:scope.has('taskui:write')};
  }catch{return null;}
}
