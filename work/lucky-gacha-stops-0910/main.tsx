import {createRoot} from 'react-dom/client';
import {StanLucky} from './before-card.generated';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const Card=StanLucky;
const bias={status:'guest',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};
createRoot(document.getElementById('root')!).render(<main style={{padding:24,maxWidth:1248,margin:'auto'}}><Card locale="en" bias={bias} guest presentation="duo" paused/></main>);
