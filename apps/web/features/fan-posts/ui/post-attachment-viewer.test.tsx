import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PostAttachmentViewer} from './post-attachment-viewer';
vi.mock('@/features/content-safety/ui/content-asset',()=>({ContentAssetImage:({asset,alt}:{asset:{id:string};alt:string})=><img src={`/authorized/${asset.id}`} alt={alt}/>}));
vi.mock('@/features/content-safety/ui/authenticated-media',()=>({AuthenticatedMedia:({play,alt,publicFanPost}:{play:boolean;alt:string;publicFanPost?:boolean})=>play?<video data-read-scope={publicFanPost?'fan-post':'private'} aria-label='Authorized video' controls/>:<img data-read-scope={publicFanPost?'fan-post':'private'} alt={alt} src='/authorized/thumbnail'/>}));
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
it('starts a permitted video through the shared autoplaying player',()=>{
 render(<PostAttachmentViewer assets={[]} video={{id:'video',width:720,height:1280,durationSeconds:30}} locale='en'/>);
 expect(screen.getByLabelText('Authorized video')).toHaveAttribute('controls');
});
it('renders no viewer for a post without attachments',()=>{
 const {container}=render(<PostAttachmentViewer assets={[]} locale='en'/>);
 expect(container).toBeEmptyDOMElement();
});

it('passes explicit guest fan-post scope to main, thumbnail and expanded video while legacy photos keep their asset reader',async()=>{
 const view=render(<PostAttachmentViewer assets={[]} video={{id:'video',width:720,height:1280,durationSeconds:30}} locale='en' publicFanPost/>);expect(view.container.querySelectorAll('img')).toHaveLength(1);expect(view.container.querySelector('img')).toHaveAttribute('data-read-scope','fan-post');expect(screen.getByLabelText('Authorized video')).toHaveAttribute('data-read-scope','fan-post');fireEvent.click(screen.getByRole('button',{name:'View all'}));expect(within(await screen.findByRole('dialog')).getByLabelText('Authorized video')).toHaveAttribute('data-read-scope','fan-post');view.unmount();render(<PostAttachmentViewer assets={assets} locale='en' publicFanPost/>);expect(screen.getByRole('img',{name:'Attached photo'})).toHaveAttribute('src','/authorized/first');for(const image of screen.getAllByRole('img'))expect(image).not.toHaveAttribute('data-read-scope');
});
