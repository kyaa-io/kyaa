import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PostAttachmentViewer} from './post-attachment-viewer';
vi.mock('@/features/content-safety/ui/content-asset',()=>({ContentAssetImage:({asset,alt}:{asset:{id:string};alt:string})=><img src={`/authorized/${asset.id}`} alt={alt}/>}));
vi.mock('@/features/content-safety/ui/authenticated-media',()=>({AuthenticatedMedia:({play,alt}:{play:boolean;alt:string})=>play?<video aria-label='Authorized video' controls/>:<img alt={alt} src='/authorized/thumbnail'/>}));
afterEach(cleanup);
const assets=[{id:'first',width:1200,height:900},{id:'second',width:900,height:1200}];
it('selects authenticated attachments with arrows and thumbnails and opens the selected original in a dialog',async()=>{
 render(<PostAttachmentViewer assets={assets} locale='en'/>);
 expect(screen.getByRole('img',{name:'Attached photo'})).toHaveAttribute('src','/authorized/first');
 expect(screen.getByRole('button',{name:'Previous'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(screen.getByRole('img',{name:'Attached photo'})).toHaveAttribute('src','/authorized/second');
 expect(screen.getByRole('button',{name:'Attached photo 2'})).toHaveAttribute('aria-pressed','true');
 const trigger=screen.getByRole('button',{name:'View all'});trigger.focus();fireEvent.click(trigger);
 const dialog=await screen.findByRole('dialog');
 expect(within(dialog).getByRole('img',{name:'Attached photo'})).toHaveAttribute('src','/authorized/second');
 fireEvent.click(within(dialog).getByRole('button',{name:'Previous'}));
 expect(within(dialog).getByRole('img',{name:'Attached photo'})).toHaveAttribute('src','/authorized/first');
 fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 await waitFor(()=>expect(trigger).toHaveFocus());
});
it('keeps a permitted video as a thumbnail until play is requested',()=>{
 render(<PostAttachmentViewer assets={[]} video={{id:'video',width:720,height:1280,durationSeconds:30}} locale='en'/>);
 expect(screen.getByRole('img',{name:'Play video'})).toBeInTheDocument();
 expect(screen.queryByLabelText('Authorized video')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Play video'}));
 expect(screen.getByLabelText('Authorized video')).toHaveAttribute('controls');
});
it('renders no viewer for a post without attachments',()=>{
 const {container}=render(<PostAttachmentViewer assets={[]} locale='en'/>);
 expect(container).toBeEmptyDOMElement();
});
