import { render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
vi.mock('@/server/signup-event/local',()=>({localSignupEnabled:()=>true}));
vi.mock('./participation',()=>({RaffleParticipation:()=>null}));
import Page from './page';
it('matches approved SNS prizes, steps and date without unconfirmed time or rewards',()=>{
 render(<Page />);expect(screen.getByRole('heading',{level:1,name:'KYAA 래플'})).toBeTruthy();
 for(const text of ['US$400 · 17명','11월 30일 마감','$100 × 1명','$50 × 2명','$25 × 4명','$10 × 10명'])expect(screen.getByText(text)).toBeTruthy();
 expect(screen.getByText('Fan Passport를 받으세요.')).toBeTruthy();expect(screen.queryByText(/23:59|신규 가입|공유|상품 확정 전/)).toBeNull();
});
