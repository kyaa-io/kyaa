import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fingerprintMedia, resolvedBase, reusableProof, imageExists, readPriorMetadata } from './aws-release-media-reuse.mjs';
import { REPOSITORY_ID, REPOSITORY, WORKFLOW_PATH } from './aws-release.mjs';
const sha='a'.repeat(40), current='b'.repeat(40), digest='sha256:'+'c'.repeat(64), hash='d'.repeat(64);
const run={id:123,repository:{id:REPOSITORY_ID,full_name:REPOSITORY},path:WORKFLOW_PATH,head_branch:'main',head_sha:sha,event:'push',status:'completed',conclusion:'success'};
const release={schemaVersion:1,repositoryId:REPOSITORY_ID,workflowPath:WORKFLOW_PATH,sourceSha:sha,sourceRunId:123,imageDigest:digest,imageUri:`123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/web@${digest}`,mediaImageDigest:digest,mediaImageUri:`123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/media@${digest}`,cronCodeSha256:hash};
const dev={...release,environment:'dev',status:'success',workflowRunId:123};
const proof={schemaVersion:1,repositoryId:REPOSITORY_ID,workflowPath:WORKFLOW_PATH,sourceSha:sha,sourceRunId:123,originalBuildSha:sha,mediaImageDigest:digest,fingerprint:hash};
const input={proof,release,dev,run,fingerprint:hash,currentSha:current};
test('reuse binds successful main push, dev result, release SHA and exact media digest',()=>{
 assert.equal(reusableProof(input),true);
 assert.equal(reusableProof({...input,proof:null}),false);
 assert.equal(reusableProof({...input,fingerprint:'e'.repeat(64)}),false);
 for(const change of [{run:{...run,event:'workflow_dispatch'}},{run:{...run,conclusion:'failure'}},{run:{...run,repository:{...run.repository,id:1}}},{release:{...release,sourceSha:current}},{dev:{...dev,mediaImageDigest:'sha256:'+'e'.repeat(64)}}]) assert.throws(()=>reusableProof({...input,...change}));
 for(const patch of [{sourceSha:current},{sourceRunId:456},{mediaImageDigest:'sha256:'+'e'.repeat(64)},{originalBuildSha:'bad'},{repositoryId:1}]) assert.equal(reusableProof({...input,proof:{...proof,...patch}}),false);
});
test('base resolution requires digest and ECR lookup cannot turn errors into hits',()=>{
 const amd64={Descriptor:{digest,platform:{os:'linux',architecture:'amd64'}}};
 const arm64={Descriptor:{digest:'sha256:'+'e'.repeat(64),platform:{os:'linux',architecture:'arm64'}}};
 assert.equal(resolvedBase('node:24',[arm64,amd64]),`node:24@${digest}`);
 assert.equal(resolvedBase('lambda:24',amd64),`lambda:24@${digest}`);
 for(const invalid of [[arm64],[amd64,amd64],{Descriptor:{digest,platform:{os:'windows',architecture:'amd64'}}},{Descriptor:{digest:'bad',platform:{os:'linux',architecture:'amd64'}}}]) assert.throws(()=>resolvedBase('node:24',invalid));
 assert.throws(()=>resolvedBase('node:24',{}));
 assert.equal(imageExists({images:[{imageId:{imageDigest:digest}}]},digest),true);
 assert.equal(imageExists({images:[],failures:[{failureCode:'ImageNotFound'}]},digest),false);
 assert.throws(()=>imageExists({failures:[{failureCode:'AccessDenied'}]},digest));
});
test('fingerprint follows bundled runtime, dependencies, tools, patches and pinned bases; ignores unrelated Docker context',async()=>{
 const root=await mkdtemp(join(tmpdir(),'media-inputs-'));
 const paths=['work/aws-media/index.cjs','package.json','package-lock.json','apps/web/package.json','apps/worker/package.json','Dockerfile.media.aws','scripts/apply-security-patches.mjs','scripts/aws-release-media-build.mjs','scripts/aws-release-media-reuse.mjs','tools/compiler/package.json'];
 const bases={node:`node:24@${digest}`,lambda:`lambda:24@${digest}`};
 try{
  for(const path of paths){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),path);}
  const original=await fingerprintMedia(bases,root);
  await writeFile(join(root,'unrelated-page.tsx'),'changed');assert.equal(await fingerprintMedia(bases,root),original);
  for(const path of paths){await writeFile(join(root,path),path+'changed');assert.notEqual(await fingerprintMedia(bases,root),original);await writeFile(join(root,path),path);}
  assert.notEqual(await fingerprintMedia({...bases,node:`node:24@sha256:${'e'.repeat(64)}`},root),original);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('original build provenance must be an ancestor of the trusted prior release; git errors fail closed',()=>{
 const older='f'.repeat(40), candidate={...input,proof:{...proof,originalBuildSha:older}};
 let checked=false;
 assert.equal(reusableProof(candidate,{assertAncestor:(ancestor,revision)=>{assert.equal(ancestor,older);assert.equal(revision,run.head_sha);checked=true;}}),true);
 assert.equal(checked,true);
 assert.equal(reusableProof(candidate,{assertAncestor:()=>{throw Object.assign(new Error('not ancestor'),{status:1});}}),false);
 assert.throws(()=>reusableProof(candidate,{assertAncestor:()=>{throw Object.assign(new Error('git failed'),{status:128});}}),/git failed/);
});

 test('missing or corrupt prior metadata is a cache miss; other file errors propagate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-metadata-'));
  try {
   assert.equal(await readPriorMetadata(root), null);
   const source = join(root, 'aws-release-source');
   await mkdir(source);
   const file = join(source, 'aws-release.json');
   await writeFile(file, '{broken');
   assert.equal(await readPriorMetadata(root), null);
   await rm(file);
   await mkdir(file);
   await assert.rejects(readPriorMetadata(root), { code: 'EISDIR' });
  } finally { await rm(root, { recursive: true, force: true }); }
 });
