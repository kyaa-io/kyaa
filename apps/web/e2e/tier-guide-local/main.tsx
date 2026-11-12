import {createRoot} from 'react-dom/client';
import {TierGuide} from '../../features/rewards/ui/tier-guide';
import {MyPassportCard} from '../../features/my/ui/my-passport-card';
import type {MySummary} from '../../features/my/domain/my-summary';
import {FanTierJourney} from '../../features/rewards/ui/fan-tier-journey';
import {parseAppLocale} from '../../i18n/locales';
import '../../app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const locale=parseAppLocale(new URLSearchParams(location.search).get('locale'));
const guide=location.pathname.includes('/notices/')||new URLSearchParams(location.search).get('view')==='guide';
document.documentElement.lang=locale;
const creators: MySummary['creators'] = [{celebrity:{slug:'elina',name:locale==='ko'?'엘리나':'Elina',image:'/images/guest-home/elina-card.jpg',isPublic:true},relationship:'passport',passport:{id:'11111111-1111-4111-8111-111111111111',tier:'Gold',score:1,remainingToNextTier:7,stageProgress:{policyVersion:3,current:{key:'gold-1',tier:'Gold',subdivision:1,rank:4,minimumScore:1},next:{key:'gold-2',tier:'Gold',subdivision:2,rank:5,minimumScore:8},remaining:7,progressPercent:0,unit:'hearts'}},ticketBalance:0,firstReaction:null}];
if (new URLSearchParams(location.search).get('view') === 'artist-bar') creators.push(
  ...['아림', '위나', '유나', '긴 아티스트 이름'].map((name, index) => ({ ...creators[0]!, celebrity: { ...creators[0]!.celebrity, slug: `artist-${index}`, name }, passport: { ...creators[0]!.passport!, id: `11111111-1111-4111-8111-11111111111${index + 2}` } })),
);
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:1120,margin:'0 auto',padding:'0 16px'}}>{guide?<TierGuide locale={locale}/>:<><h1>MY</h1><MyPassportCard creators={creators} selectedSlug="elina" onSelect={()=>{}} communityStamps={[]} stampsError={false} retryStamps={()=>{}} locale={locale} labels={{title:locale==='ko'?'내 패스포트':'My Passport',detail:locale==='ko'?'기록 보기':'View record',noCreators:'',findCreator:'',loadError:'',retry:'',creators:'Elina'}}/><FanTierJourney locale={locale} tier="Gold" creatorName="Elina" currentLabel={locale==='ko'?'골드 1':'Gold 1'} topLabel="Diamond" nextAria="Gold 2" me={<img src="/images/avatars/heart-lavender.webp" alt=""/>} creator={<img src="/images/guest-home/elina-card.jpg" alt=""/>} stage={{policyVersion:3,current:{key:'gold-1',tier:'Gold',subdivision:1,rank:4,minimumScore:1},next:{key:'gold-2',tier:'Gold',subdivision:2,rank:5,minimumScore:8},remaining:7,progressPercent:0,unit:'hearts'}}/></>}</main>);
