// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {TierGuide} from './tier-guide';
import {TierGuideInfo} from './tier-guide-info';
import {tierGuideCopy} from './tier-guide-copy';
const push=vi.fn();
vi.mock('next/navigation',()=>({useRouter:()=>({push,back:vi.fn()})}));
afterEach(()=>{cleanup();push.mockReset();});
describe('tier guide',()=>{
 it('opens a dismissible dialog and preserves locale on the guide destination',()=>{
 render(<TierGuideInfo locale="ko"/>);
 fireEvent.click(screen.getByRole('button',{name:'팬 등급 안내'}));
 expect(screen.getByRole('dialog')).toBeTruthy();
 expect(screen.getByRole('heading',{name:'등급 체계를 알아볼까요?'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'보러 가기'}));
 expect(push).toHaveBeenCalledWith('/notices/tier-guide?locale=ko');
 expect(screen.queryByRole('dialog')).toBeNull();
 });
 for(const locale of APP_LOCALES) it(`shows all 11 actual stages in ${locale}`,()=>{
 const {container}=render(<TierGuide locale={locale}/>);
 expect(screen.getByRole('heading',{level:1,name:tierGuideCopy(locale).title})).toBeTruthy();
 expect(container.querySelectorAll('[data-tier-stage]')).toHaveLength(11);
 expect([...container.querySelectorAll('[data-tier-stage]')].map(el=>el.textContent?.match(/\d+/g)?.at(-1)??'issued')).toEqual(['issued','3','6','1','8','11','14','17','20','24','28']);
 expect(container.querySelector('img[src="/images/guides/tier-guide.webp"]')).toBeTruthy();
 });
});
