import { render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({ready:true,authenticated:true})}));
import { SignupEventExports } from './exports';
it('exports entrants and the approved 17 winners without a different quantity input',()=>{
 render(<SignupEventExports />);expect(screen.getByRole('button',{name:'응모자 내보내기'})).not.toBeDisabled();
 expect(screen.getByRole('button',{name:'17명 추첨 명단 내보내기'})).not.toBeDisabled();expect(screen.queryByRole('spinbutton')).toBeNull();
});
