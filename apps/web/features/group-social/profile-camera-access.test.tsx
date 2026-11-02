import '@testing-library/jest-dom/vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WaveFriendScanner} from '@/features/fanpage/ui/wave-friend-scanner';
import {ProfileCameraAccessState} from './profile-camera-access';
import {waveFriendsCopy} from '@/i18n/catalogs/features__fanpage__wave-friends';
const qr=vi.hoisted(()=>({start:vi.fn(),destroy:vi.fn()}));
vi.mock('qr-scanner',()=>({default:class{start=qr.start;stop=vi.fn();destroy=qr.destroy;}}));
const media=Object.getOwnPropertyDescriptor(navigator,'mediaDevices'),permissions=Object.getOwnPropertyDescriptor(navigator,'permissions');
function setMedia(value:unknown){Object.defineProperty(navigator,'mediaDevices',{configurable:true,value});}
function setPermission(query:unknown){Object.defineProperty(navigator,'permissions',{configurable:true,value:{query}});}
function Scanner(){return <WaveFriendScanner locale='ko' onScan={vi.fn()} renderCameraIssue={(issue,onRetry)=><ProfileCameraAccessState locale='ko' issue={issue} onRetry={onRetry}/>}/>;}
beforeEach(()=>{vi.stubGlobal('isSecureContext',true);qr.start.mockReset().mockResolvedValue(undefined);qr.destroy.mockReset();setMedia({getUserMedia:vi.fn()});setPermission(vi.fn(async()=>({state:'prompt'})));});
afterEach(()=>{if(media)Object.defineProperty(navigator,'mediaDevices',media);else Reflect.deleteProperty(navigator,'mediaDevices');if(permissions)Object.defineProperty(navigator,'permissions',permissions);else Reflect.deleteProperty(navigator,'permissions');vi.unstubAllGlobals();});
it('shows source unsupported guidance without starting or requesting a camera',async()=>{
 setMedia(undefined);render(<Scanner/>);expect(await screen.findByRole('heading',{name:'카메라 미지원'})).toBeInTheDocument();expect(screen.getByText('친구가 공유한 프로필 링크로 접속해 주세요.')).toBeInTheDocument();expect(qr.start).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'카메라 다시 열기'})).toBeNull();expect(screen.getByRole('button',{name:waveFriendsCopy('ko').uploadQr})).toBeEnabled();
});
it('shows denied only for an actual permission state, retries capability reads without prompting',async()=>{
 const getUserMedia=vi.fn(),query=vi.fn(async()=>({state:'denied'}));setMedia({getUserMedia});setPermission(query);render(<Scanner/>);expect(await screen.findByRole('heading',{name:'카메라 권한 없음'})).toBeInTheDocument();expect(screen.getByText('브라우저 설정에서 카메라 접근을 허용해 주세요.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'카메라 다시 열기'}));await waitFor(()=>expect(query).toHaveBeenCalledTimes(2));expect(qr.start).not.toHaveBeenCalled();expect(getUserMedia).not.toHaveBeenCalled();
});
it('rechecks permission after a swallowed library error, using denied only when observed',async()=>{
 const query=vi.fn().mockResolvedValueOnce({state:'prompt'}).mockResolvedValueOnce({state:'denied'});setPermission(query);qr.start.mockRejectedValue('Camera not found.');render(<Scanner/>);expect(await screen.findByRole('heading',{name:'카메라 권한 없음'})).toBeInTheDocument();expect(query).toHaveBeenCalledTimes(2);
});
it('never infers denial from generic Camera not found when querying permission is unsupported',async()=>{
 setPermission(vi.fn(async()=>{throw new TypeError('camera query unsupported');}));qr.start.mockRejectedValue('Camera not found.');render(<Scanner/>);expect(await screen.findByRole('alert')).toHaveTextContent(waveFriendsCopy('ko').cameraError);expect(screen.queryByRole('heading',{name:'카메라 권한 없음'})).toBeNull();expect(screen.queryByRole('heading',{name:'카메라 미지원'})).toBeNull();
});
it('does not start a scanner after unmount while permission state is pending',async()=>{
 let resolve!:(value:unknown)=>void;setPermission(vi.fn(()=>new Promise(value=>resolve=value)));const view=render(<Scanner/>);view.unmount();await act(async()=>resolve({state:'granted'}));expect(qr.start).not.toHaveBeenCalled();
});
it('allows camera retry after settings changes, using only a mocked scanner',async()=>{
 const query=vi.fn().mockResolvedValueOnce({state:'denied'}).mockResolvedValue({state:'granted'});setPermission(query);render(<Scanner/>);await screen.findByRole('heading',{name:'카메라 권한 없음'});fireEvent.click(screen.getByRole('button',{name:'카메라 다시 열기'}));await waitFor(()=>expect(qr.start).toHaveBeenCalledOnce());expect(screen.queryByRole('heading',{name:'카메라 권한 없음'})).toBeNull();
});
it('shows unsupported in an insecure context without querying or starting the camera',async()=>{
 vi.stubGlobal('isSecureContext',false);const query=vi.fn(async()=>({state:'denied'}));setPermission(query);render(<Scanner/>);expect(await screen.findByRole('heading',{name:'카메라 미지원'})).toBeInTheDocument();expect(query).not.toHaveBeenCalled();expect(qr.start).not.toHaveBeenCalled();
});
it('keeps a generic hardware/library failure generic when permission is granted',async()=>{
 setPermission(vi.fn(async()=>({state:'granted'})));qr.start.mockRejectedValue('Camera not found.');render(<Scanner/>);expect(await screen.findByRole('alert')).toHaveTextContent(waveFriendsCopy('ko').cameraError);expect(screen.queryByRole('heading',{name:'카메라 권한 없음'})).toBeNull();expect(screen.queryByRole('heading',{name:'카메라 미지원'})).toBeNull();
});
