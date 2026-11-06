import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const answers=vi.hoisted(()=>new Map<unknown,unknown>());
const state=vi.hoisted(()=>({urls:[] as (string|null)[],items:[{name:'아이유',secondaryName:'IU',category:'singer',page:null},{name:'아이브',secondaryName:'IVE',category:'idol',page:{slug:'ive'}}] as unknown[]}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string|null,parse:(value:unknown)=>unknown)=>{state.urls.push(url);if(url&&!answers.has(state.items))answers.set(state.items,parse({items:state.items}));return {data:url?answers.get(state.items):undefined,error:false,loading:false};}}));
import {CelebrityNameField} from './celebrity-name-field';
beforeEach(()=>{vi.useFakeTimers();state.urls.length=0;});
afterEach(()=>{cleanup();vi.useRealTimers();});
const type=(value:string)=>{const input=screen.getByRole('combobox');fireEvent.focus(input);fireEvent.change(input,{target:{value}});act(()=>{vi.advanceTimersByTime(200);});return input;};
it('asks after a pause with the typed name and language',()=>{
 render(<CelebrityNameField locale='en' label='Name'/>);const input=screen.getByRole('combobox');fireEvent.change(input,{target:{value:'아이'}});
 expect(state.urls.filter(Boolean)).toHaveLength(0);act(()=>{vi.advanceTimersByTime(200);});
 expect(state.urls.at(-1)).toBe(`/api/celebrities/suggest?q=${encodeURIComponent('아이')}&locale=en`);
});
it('picks with the keyboard and describes the open list',()=>{
 render(<CelebrityNameField locale='ko' label='이름'/>);const input=type('아이');
 expect(input).toHaveAttribute('aria-expanded','true');expect(screen.getAllByRole('option')).toHaveLength(2);
 fireEvent.keyDown(input,{key:'ArrowDown'});expect(input.getAttribute('aria-activedescendant')).toContain('option-0');
 fireEvent.keyDown(input,{key:'Enter'});expect(input).toHaveValue('아이유');expect(input).toHaveAttribute('aria-expanded','false');
});
it('keeps a name that is not listed, and Enter stays with the form',()=>{
 state.items=[];render(<form><CelebrityNameField locale='ko' label='이름'/></form>);const input=type('없는 이름');
 expect(screen.queryByRole('option')).toBeNull();expect(input).toHaveValue('없는 이름');expect(input).toBeRequired();
 expect(fireEvent.keyDown(input,{key:'Enter'})).toBe(true);
 state.items=[{name:'아이유',secondaryName:'IU',category:'singer',page:null},{name:'아이브',secondaryName:'IVE',category:'idol',page:{slug:'ive'}}];
});
it('does not take Enter or arrows from an open composition',()=>{
 render(<CelebrityNameField locale='ko' label='이름'/>);const input=type('아이');
 fireEvent.keyDown(input,{key:'ArrowDown'});fireEvent.keyDown(input,{key:'Enter',isComposing:true});expect(input).toHaveValue('아이');
});
it('closes on Escape without closing the dialog around it, and leaves the text',()=>{
 const outer=vi.fn();render(<div onKeyDown={outer}><CelebrityNameField locale='ko' label='이름'/></div>);const input=type('아이');
 fireEvent.keyDown(input,{key:'Escape'});expect(input).toHaveAttribute('aria-expanded','false');expect(input).toHaveValue('아이');expect(outer).not.toHaveBeenCalled();
 fireEvent.keyDown(input,{key:'Escape'});expect(outer).toHaveBeenCalledOnce();
});
it('says when the picked name already has a page and links to it',()=>{
 render(<CelebrityNameField locale='ko' label='이름'/>);type('아이');fireEvent.click(screen.getByRole('option',{name:/아이브/}));
 expect(screen.getByText(/이미 열린 팬페이지예요/)).toBeInTheDocument();expect(screen.getByRole('link',{name:'페이지 보기'})).toHaveAttribute('href','/ive?locale=ko');
});
it('starts from a name carried over from a search',()=>{render(<CelebrityNameField locale='ko' label='이름' initialValue='Ru'/>);expect(screen.getByRole('combobox')).toHaveValue('Ru');});
