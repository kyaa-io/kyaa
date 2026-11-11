import { render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({ready:true,authenticated:true})}));
import { SignupEventExports } from './exports';
it('requires an explicit winner quantity and offers separate masked exports',()=>{
 render(<SignupEventExports />);
 expect(screen.getByRole('button',{name:'기간 가입자 내보내기'})).not.toBeDisabled();
 expect(screen.getByRole('button',{name:'추첨 명단 내보내기'})).toBeDisabled();
 expect(screen.getByRole('spinbutton',{name:'당첨 인원'})).toHaveValue(null);
});
