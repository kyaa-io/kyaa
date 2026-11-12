import {createRoot} from 'react-dom/client';
import {FanPostRow} from '@/components/fan-ui/fan-post-row';
import {APP_LOCALES} from '@/i18n/locales';
import '@/app/globals.css';
const locale=APP_LOCALES.find(l=>l===new URLSearchParams(location.search).get('locale'))??'ko';
createRoot(document.getElementById('root')!).render(<main style={{padding:16,maxWidth:1360,margin:'auto'}}><h1>Hot 게시글 · 로컬 예시</h1>{['엔카이브 팬페이지 별빛','아주 긴 팬페이지 이름으로도 제목과 메타가 겹치지 않는지 확인하는 팬페이지'].map((name,i)=><FanPostRow key={i} locale={locale} href='#post' title={'오늘의 공연 이야기와 함께하는 아주 긴 게시글 제목 '.repeat(5)} source={{label:name,href:'#page'}} author={i?'긴작성자이름MusicFan'.repeat(3):'별빛'} time='2026-11-12T12:00:00Z' views={1234} likes={123} commentCount={12} reactedBy={i?'엘리나':undefined}/>)}<h2>게시판</h2><FanPostRow locale={locale} href='#post' title='팬 게시판의 공통 목록 행' author='별빛' time='2026-11-12T12:00:00Z' views={1234} likes={123}/></main>);
