import {useState} from 'react';
import {UserRound,UserRoundPlus} from 'lucide-react';
import type {AppLocale} from '../../i18n/locales';
import {GroupMembers} from '../../features/groups/ui/group-members';
import {GroupShell} from '../../features/groups/ui/group-shell';
import {CreatorGroupHeader} from '../../features/groups/ui/creator-group-header';
import {FanAction} from '../../components/fan-ui/fan-action';
import {pencilArtistCreator} from './pencil-artist-fixture';
import './pencil-members-preview.css';
/** Source-only composition. Profiles and relationship actions reuse the authorized social route. */
export function PencilMembersPreview({locale,pageId}:{locale:AppLocale;pageId:string}){
 const [copied,setCopied]=useState(false),[qr,setQr]=useState(false);
 const peer='/my/friends?locale='+locale+'&profileId=e9700000-0000-4000-8000-000000000002';
 return <><GroupShell locale={locale}><CreatorGroupHeader celebrity={pencilArtistCreator(locale)} locale={locale} tab='members'/><div className='pencil-members-layout'><GroupMembers pageId={pageId} locale={locale} member presentation={{creatorName:'엔카이브',selectedProfileId:'e9700000-0000-4000-8000-000000000002',overview:<><p>함께 활동하는 팬을 만나보세요.</p><dl><div><dt>소유자</dt><dd>별빛</dd></div><div><dt>회원</dt><dd>1,280명</dd></div><div><dt>공개 범위</dt><dd>공개 글 누구나 · 멤버 글 가입 후</dd></div></dl></>,subtitles:{별빛:'소유자 · 팬 인증 완료',하늘:'Gold · 팬 인증 완료',보라:'Gold · 팬 인증 완료',은하:'Bronze'}}}/><aside className='pencil-members-context'><section><h2><UserRound size={20}/>하늘 · 공개 프로필</h2><p>Gold · 팬 인증 완료</p><p>공개한 최애 · 엔카이브</p><div><FanAction href={peer}>친구 요청</FanAction><FanAction href={peer}>대화 요청</FanAction></div></section><section><h2><UserRoundPlus size={20}/>초대하기</h2><label>초대 링크<input readOnly value='kyaa.io/community/nchive'/></label><div><FanAction onClick={async()=>{await navigator.clipboard.writeText('https://kyaa.io/community/nchive');setCopied(true);}}>{copied?'복사됨':'초대 링크 복사'}</FanAction><FanAction onClick={()=>setQr(!qr)}>QR 보기</FanAction></div>{qr&&<p role='status'>QR 미리보기 · 링크 연결 전</p>}</section><section className='pencil-members-ad'><p>광고</p></section></aside></div></GroupShell></>;
}
