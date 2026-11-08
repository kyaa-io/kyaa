import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_LOCALES } from '@/i18n/locales';
import { ProfileConnectionPanel } from './profile-connection';
import { profileConnectionCopy,profileUnreachableCopy } from './profile-copy';
import { parseSocialProfileLink, parseSocialLinkedProfile, socialFriendToken } from './profile-link';
import { waveFriendsCopy } from '@/i18n/catalogs/features__fanpage__wave-friends';
const mock=vi.hoisted(()=>({resource:vi.fn(),request:vi.fn(),retry:vi.fn(),canvas:vi.fn(),scan:undefined as undefined|((token:string)=>void)}));
vi.mock('@/features/groups/ui/use-group-resource',()=>({useGroupRequest:()=>({ownerKey:'me:1',request:mock.request}),useGroupResource:(...args:unknown[])=>({...mock.resource(...args),retry:mock.retry,request:mock.request})}));
vi.mock('qrcode',()=>({toCanvas:mock.canvas}));
vi.mock('@/features/fanpage/ui/wave-friend-scanner',()=>({WaveFriendScanner:({onScan,decode}:{onScan:(token:string)=>void;decode:(value:string,origin:string)=>string|null})=>{mock.scan=onScan;return <button onClick={()=>{const token=decode(location.origin+'/my/friends?friend=22222222-2222-4222-8222-222222222222',location.origin);if(token)onScan(token);}}>test scan</button>;}}));
const token='22222222-2222-4222-8222-222222222222',person='11111111-1111-4111-8111-111111111111',copy=waveFriendsCopy('ko');
const peer={profile:{id:person,nickname:'하늘',avatarUrl:'/images/avatars/star-pink.webp'},relationship:{friendshipId:null,status:'none'},capabilities:{canRequestFriend:true},isSelf:false};
beforeEach(()=>{vi.clearAllMocks();mock.canvas.mockResolvedValue(undefined);mock.request.mockResolvedValue({});mock.resource.mockImplementation((url:string)=>url?.includes('profile-links/')?{data:peer}:{data:{token,expiresAt:new Date(Date.now()+86400000).toISOString()},error:false});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});});
afterEach(cleanup);
describe('Pencil profile connection',()=>{
 it('renders an API token as QR, copies its actual friend route and restores focus',async()=>{
  const closed=vi.fn(),trigger=document.createElement('button');document.body.append(trigger);trigger.focus();
  const view=render(<ProfileConnectionPanel locale='ko' identity={<span>별빛</span>} onClose={closed}/>);
  expect(await screen.findByRole('dialog',{name:'별빛'})).toBeInTheDocument();
  const copyButton=screen.getByRole('button',{name:'내 프로필 링크 복사'});await waitFor(()=>expect(copyButton).toBeEnabled());
  expect(mock.canvas).toHaveBeenCalledWith(expect.any(HTMLCanvasElement),`${location.origin}/my/friends?locale=ko&friend=${token}`,expect.objectContaining({width:480,margin:4,errorCorrectionLevel:'H'}));
  expect(screen.getByRole('img',{name:'내 친구 추가 QR'}).parentElement?.querySelector('img')).toHaveAttribute('src','/images/guest-home/kyaa-wordmark.svg');
  fireEvent.click(copyButton);await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalledOnce());expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${location.origin}/my/friends?locale=ko&friend=${token}`);await screen.findByRole('button',{name:copy.copied});
  fireEvent.click(screen.getByRole('button',{name:'닫기'}));expect(closed).toHaveBeenCalledOnce();view.unmount();await waitFor(()=>expect(document.activeElement).toBe(trigger));trigger.remove();
 });
 it('uses the shared scanner and requests friendship only after profile confirmation',async()=>{
  const changed=vi.fn();render(<ProfileConnectionPanel locale='ko' identity='나' onClose={()=>{}} onFriendChanged={changed}/>);
  fireEvent.click(screen.getByRole('button',{name:'친구 QR 찍기'}));fireEvent.click(screen.getByRole('button',{name:'test scan'}));
  expect(await screen.findByText('하늘')).toBeInTheDocument();expect(mock.resource).toHaveBeenCalledWith(`/api/me/social/profile-links/${token}?locale=ko`,expect.any(Function));expect(mock.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:copy.requestFriend}));await screen.findByText(copy.requested);expect(changed).toHaveBeenCalledOnce();
  const [path,options]=mock.request.mock.calls[0];expect(path).toBe('/api/me/social/friends');expect(JSON.parse(options.body)).toEqual({profileId:person,requestId:expect.any(String)});expect(mock.request).toHaveBeenCalledTimes(1);
 });
 it('keeps retry identity after an uncertain request and never duplicates a pending request',async()=>{
  let reject!:(e:Error)=>void;mock.request.mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no;}));render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);
  const button=await screen.findByRole('button',{name:copy.requestFriend});fireEvent.click(button);fireEvent.click(button);expect(mock.request).toHaveBeenCalledTimes(1);
  await act(async()=>reject(new Error('network')));expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);const first=JSON.parse(mock.request.mock.calls[0][1].body).requestId;
  fireEvent.click(button);await screen.findByText(copy.requested);expect(JSON.parse(mock.request.mock.calls[1][1].body).requestId).toBe(first);
 });
 it.each([{...peer,isSelf:true},{...peer,capabilities:{canRequestFriend:false}},{...peer,relationship:{friendshipId:person,status:'friends'}},{...peer,relationship:{friendshipId:person,status:'outgoing'}}])('does not request friendship when server permissions or relationship disallow it',async value=>{
  mock.resource.mockReturnValue({data:value,error:false});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);await screen.findByText('하늘');expect(screen.queryByRole('button',{name:copy.requestFriend})).toBeNull();expect(mock.request).not.toHaveBeenCalled();
 });
 it('accepts an incoming request with its existing friendship ID',async()=>{mock.resource.mockReturnValue({data:{...peer,relationship:{friendshipId:person,status:'incoming'},capabilities:{canRequestFriend:false}}});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:copy.accept}));await screen.findByText(copy.alreadyFriends);expect(mock.request).toHaveBeenCalledWith(`/api/me/social/friends/${person}`,expect.objectContaining({method:'PATCH'}));expect(JSON.parse(mock.request.mock.calls[0][1].body)).toMatchObject({action:'accept'});});
 it('shows invalid or expired linked-profile errors without a request button',async()=>{
  mock.resource.mockReturnValue({error:true});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);expect(await screen.findByRole('alert')).toHaveTextContent(copy.invalidQr);expect(screen.queryByRole('button',{name:copy.requestFriend})).toBeNull();fireEvent.click(screen.getByRole('button',{name:copy.retry}));expect(mock.retry).toHaveBeenCalledOnce();
 });
 it.each(APP_LOCALES)('names the real reason when the link resolves to nothing (404), not a new-QR retry, in %s',async locale=>{
  mock.resource.mockReturnValue({error:true,failure:{status:404,code:'SOCIAL_NOT_FOUND'}});render(<ProfileConnectionPanel locale={locale} identity='나' initialToken={token} onClose={()=>{}}/>);
  const alert=await screen.findByRole('alert');expect(alert).toHaveTextContent(profileUnreachableCopy(locale));expect(alert).not.toHaveTextContent(waveFriendsCopy(locale).invalidQr);expect(screen.queryByRole('button',{name:waveFriendsCopy(locale).retry})).toBeNull();expect(profileUnreachableCopy(locale).length).toBeGreaterThan(10);
 });
 it('keeps the retry for failures that are not a missing link',async()=>{
  mock.resource.mockReturnValue({error:true,failure:{status:500,code:'INTERNAL'}});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);expect(await screen.findByRole('alert')).toHaveTextContent(copy.invalidQr);fireEvent.click(screen.getByRole('button',{name:copy.retry}));expect(mock.retry).toHaveBeenCalledOnce();
 });
 it('does not render or copy an already expired QR',async()=>{
  mock.resource.mockReturnValue({data:{token,expiresAt:new Date(Date.now()-1000).toISOString()}});render(<ProfileConnectionPanel locale='ko' identity='나' onClose={()=>{}}/>);expect(await screen.findByRole('alert')).toHaveTextContent(copy.invalidQr);expect(screen.getByRole('button',{name:'내 프로필 링크 복사'})).toBeDisabled();expect(screen.queryByRole('img')).toBeNull();
 });
 it('offers recovery after API or QR rendering failure',async()=>{
  mock.canvas.mockRejectedValue(new Error('canvas'));render(<ProfileConnectionPanel locale='ko' identity='나' onClose={()=>{}}/>);expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);mock.canvas.mockResolvedValue(undefined);fireEvent.click(screen.getByRole('button',{name:copy.retry}));await waitFor(()=>expect(screen.getByRole('button',{name:'내 프로필 링크 복사'})).toBeEnabled());
 });
 it('reports clipboard failure without claiming the link was copied',async()=>{
  vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));render(<ProfileConnectionPanel locale='ko' identity='나' onClose={()=>{}}/>);const button=screen.getByRole('button',{name:'내 프로필 링크 복사'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);expect(screen.queryByText(copy.copied)).toBeNull();
 });
 it('does not issue a friend request for an unconnected fixture peer',async()=>{render(<ProfileConnectionPanel locale='ko' identity='나' peerIdentity='별빛' initialView='peer' onClose={()=>{}}/>);expect(await screen.findByRole('button',{name:copy.requestFriend})).toBeDisabled();});
 it('validates same-origin token links and peer/link API boundaries',()=>{
  expect(socialFriendToken(`${location.origin}/my/friends?friend=${token}`,location.origin)).toBe(token);
  for(const link of [`https://other.test/my/friends?friend=${token}`,`${location.origin}/my/friends?friend=${token}&friend=${token}`,`${location.origin}/my/friends?friend=bad`,`${location.origin}/kyaa-wave-fanpage?friend=${token}`])expect(socialFriendToken(link,location.origin)).toBeNull();
  expect(()=>parseSocialProfileLink({token:'bad',expiresAt:'bad'})).toThrow();expect(()=>parseSocialLinkedProfile({...peer,profile:{...peer.profile,avatarUrl:'https://evil.test/x'}})).toThrow();
 });
 it.each(APP_LOCALES)('has all profile strings in %s',locale=>{const values=Object.values(profileConnectionCopy(locale));expect(values).toHaveLength(15);expect(values.every(value=>typeof value==='string'&&value.length>0)).toBe(true);});
});

it('shows only the public favorite returned by the linked-profile API',async()=>{
 mock.resource.mockReturnValue({data:{...peer,favorite:{name:'엔카이브'}}});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);expect(await screen.findByText('공개한 최애 · 엔카이브')).toBeInTheDocument();expect(mock.request).not.toHaveBeenCalled();
});
it('does not invent a favorite when the linked profile keeps it private',async()=>{
 mock.resource.mockReturnValue({data:{...peer,favorite:null}});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);await screen.findByText('하늘');expect(screen.queryByText(/공개한 최애/)).not.toBeInTheDocument();
});
it('offers the actual friends route for an existing friendship',async()=>{
 mock.resource.mockReturnValue({data:{...peer,relationship:{friendshipId:person,status:'friends'}}});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);expect(await screen.findByRole('link',{name:'친구 목록'})).toHaveAttribute('href','/my/friends?locale=ko');expect(mock.request).not.toHaveBeenCalled();
});
it('offers the friends route after accepting an incoming request',async()=>{
 mock.resource.mockReturnValue({data:{...peer,relationship:{friendshipId:person,status:'incoming'},capabilities:{canRequestFriend:false}}});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:copy.accept}));expect(await screen.findByRole('link',{name:'친구 목록'})).toHaveAttribute('href','/my/friends?locale=ko');
});
it('parses only the already-public favorite name, never hidden profile or favorite fields',()=>{
 const parsed=parseSocialLinkedProfile({...peer,favorite:{name:'엔카이브',fanXp:999,privateNotes:'hidden'},privateFavorites:['hidden'],evidence:{body:'hidden'}});expect(parsed.favorite).toEqual({name:'엔카이브'});expect(parsed).not.toHaveProperty('privateFavorites');expect(parsed).not.toHaveProperty('evidence');
});

it('closes the linked-profile overlay when opening the friends list',async()=>{const close=vi.fn();mock.resource.mockReturnValue({data:{...peer,relationship:{friendshipId:person,status:'friends'}}});render(<ProfileConnectionPanel locale='ko' identity='나' initialToken={token} onClose={close}/>);fireEvent.click(await screen.findByRole('link',{name:'친구 목록'}));expect(close).toHaveBeenCalledOnce();});
