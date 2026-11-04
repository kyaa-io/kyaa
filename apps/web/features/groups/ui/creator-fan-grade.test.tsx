import {render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {CreatorFanGrade} from './creator-fan-grade';
const state=vi.hoisted(()=>({auth:{ready:true,authenticated:true},resource:{state:{status:'ready',data:{creators:[]}}} as any,url:null as string|null}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>state.auth}));
vi.mock('@/components/fan-ui/use-owned-fan-resource',()=>({useOwnedFanResource:(url:string|null)=>{state.url=url;return state.resource;}}));
vi.mock('@/features/rewards/ui/fan-tier-badge',()=>({FanTierBadge:({tier,stageKey}:any)=><span data-testid="tier" data-stage={stageKey}>{tier}</span>}));
beforeEach(()=>{state.auth={ready:true,authenticated:true};state.resource={state:{status:'ready',data:{creators:[{celebrity:{slug:'elina'},passport:{id:'original-passport',tier:'Silver'}},{celebrity:{slug:'nchive'},passport:{id:'other-passport',tier:'Gold'}}]}},retry:vi.fn()};});
it('shows only the current artist owner-scoped tier and original passport link',()=>{render(<CreatorFanGrade slug="elina" locale="ko"/>);expect(state.url).toBe('/api/me/summary?locale=ko&tierStages=1');expect(screen.getByTestId('tier')).toHaveTextContent('Silver');expect(screen.queryByText('Gold')).toBeNull();expect(screen.getByRole('link')).toHaveAttribute('href','/passports/original-passport?locale=ko');});
it('never reuses another artist tier when the current one has no passport',()=>{render(<CreatorFanGrade slug="unknown" locale="ko"/>);expect(screen.queryByTestId('tier')).toBeNull();expect(screen.getByRole('link')).toHaveAttribute('href','/c/unknown/verify?locale=ko');});
it('hides stale data for a signed-out owner and disables the read',()=>{state.auth.authenticated=false;render(<CreatorFanGrade slug="elina" locale="ko"/>);expect(state.url).toBeNull();expect(screen.queryByRole('link')).toBeNull();});
it('does not expose a tier while auth is restoring',()=>{state.auth.ready=false;render(<CreatorFanGrade slug="elina" locale="ko"/>);expect(screen.queryByTestId('tier')).toBeNull();});
it('shows loading without guessing a room requirement as a tier',()=>{state.resource.state={status:'loading'};render(<CreatorFanGrade slug="elina" locale="ko"/>);expect(screen.getByRole('status')).toBeInTheDocument();expect(screen.queryByTestId('tier')).toBeNull();});
it('provides retry on failed grade lookup without a fabricated grade',()=>{state.resource.state={status:'error',kind:'network'};render(<CreatorFanGrade slug="elina" locale="ko"/>);expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.getByRole('button',{name:'다시 시도'})).toBeInTheDocument();expect(screen.queryByTestId('tier')).toBeNull();});

it('preserves the server-provided personal stage rather than deriving one from entry requirements',()=>{state.resource.state.data.creators[0].passport.stageProgress={current:{key:"silver-2",tier:"Silver",subdivision:2}};render(<CreatorFanGrade slug="elina" locale="ko"/>);expect(screen.getByTestId("tier")).toHaveAttribute("data-stage","silver-2");});
