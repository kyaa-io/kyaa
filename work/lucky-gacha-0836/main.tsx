import {createRoot} from 'react-dom/client';
import {StanLucky} from '@/features/groups/ui/stan-lucky-cheer';
import {StanLucky as BeforeStanLucky} from './before-card.generated';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const before=new URLSearchParams(location.search).has('before');
const Card=before?BeforeStanLucky:StanLucky;
const bias={status:'guest',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};
createRoot(document.getElementById('root')!).render(<main style={{padding:24,maxWidth:1248,margin:'auto'}}><Card locale="en" bias={bias} guest presentation="duo" paused/></main>);
