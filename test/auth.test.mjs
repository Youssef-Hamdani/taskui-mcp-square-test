import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {generateKeyPair,exportJWK,SignJWT} from 'jose';
test('OAuth verifies signature, expiry, issuer, audience, owner and scopes',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');const key=await exportJWK(publicKey);key.kid='synthetic';key.alg='RS256';
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[key]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const issuer=`http://127.0.0.1:${server.address().port}`;
 Object.assign(process.env,{TASKUI_JWKS_URL:issuer+'/jwks',TASKUI_OAUTH_ISSUER:issuer,TASKUI_OAUTH_AUDIENCE:'taskui-test',TASKUI_OWNER_SUBJECT:'owner',TASKUI_PUBLIC_URL:issuer});
 const {authenticate,oauthReady}=await import('../lib/auth.mjs');assert.equal(oauthReady(),true);
 const token=async(claims={},expiry='5m')=>new SignJWT({scope:'taskui:read taskui:write',...claims}).setProtectedHeader({alg:'RS256',kid:'synthetic'}).setIssuer(issuer).setAudience('taskui-test').setSubject(claims.sub??'owner').setExpirationTime(expiry).sign(privateKey);
 const req=t=>({headers:{authorization:'Bearer '+t}});
 try{assert.equal(await authenticate({headers:{}}),null);assert.equal((await authenticate(req(await token()))).write,true);assert.equal((await authenticate(req(await token({scope:'taskui:read'})))).write,false);assert.equal(await authenticate(req(await token({sub:'someone-else'}))),null);assert.equal(await authenticate(req(await token({},'-1s'))),null);assert.equal(await authenticate(req('forged')),null);
 const wrong=new SignJWT({scope:'taskui:read'}).setProtectedHeader({alg:'RS256',kid:'synthetic'}).setIssuer(issuer).setAudience('wrong').setSubject('owner').setExpirationTime('5m');assert.equal(await authenticate(req(await wrong.sign(privateKey))),null);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
