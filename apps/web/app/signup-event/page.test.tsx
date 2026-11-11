import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/server/signup-event/local',()=>({localSignupEnabled:()=>true}));
vi.mock('./sharing',()=>({SignupEventSharing:()=> <button>공유하기</button>}));
import SignupEventPage from './page';
it('renders the requested event window and unresolved prize without inventing prizes',()=>{
 render(<SignupEventPage />);
 expect(screen.getByRole('heading',{level:1,name:'신규 가입 이벤트'})).toBeTruthy();
 expect(screen.getByText('상품 확정 전')).toBeTruthy();
 expect(screen.getByText(/11월 24일 23:59/)).toBeTruthy();
 expect(screen.getByRole('button',{name:'공유하기'})).toBeTruthy();
 expect(screen.queryByText(/100불/)).toBeNull();
});
