import {act,fireEvent,render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {discoveryBannerFixtures} from '@/e2e/groups-local/banner-fixtures';
import {DiscoveryCarousel} from './discovery-carousel';
describe('Pencil discovery carousel',()=>{
 it('changes the active slide and excludes the preview from interaction',()=>{
  const {container}=render(<DiscoveryCarousel banners={discoveryBannerFixtures("ko")} locale='ko'/>);
  expect(screen.getByRole('link',{name:discoveryBannerFixtures('ko')[0].ctaLabel})).toHaveAttribute('href','/wena?locale=ko');
  expect(container.querySelectorAll('[inert]')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:'다음 배너'}));
  expect(screen.getByRole('link',{name:discoveryBannerFixtures('ko')[1].ctaLabel})).toHaveAttribute('href','/nchive?locale=ko');
  expect(screen.queryByRole('link',{name:discoveryBannerFixtures('ko')[0].ctaLabel})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'이전 배너'}));
  expect(screen.getByRole('link',{name:discoveryBannerFixtures('ko')[0].ctaLabel})).toBeInTheDocument();
 });
 it('advances after six seconds and stops when paused',()=>{
  vi.useFakeTimers();
  const {unmount}=render(<DiscoveryCarousel banners={discoveryBannerFixtures("ko")} locale='ko'/>);
  act(()=>vi.advanceTimersByTime(6000));
  expect(screen.getByRole('link',{name:discoveryBannerFixtures('ko')[1].ctaLabel})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'자동 넘김 일시정지'}));
  act(()=>vi.advanceTimersByTime(12000));
  expect(screen.getByRole('link',{name:discoveryBannerFixtures('ko')[1].ctaLabel})).toBeInTheDocument();
  unmount();
  vi.useRealTimers();
 });
});

it('uses registered destinations and categories for any number of banners',()=>{
 const banners=discoveryBannerFixtures('ko');
 render(<DiscoveryCarousel locale='ja' banners={[...banners,{...banners[0],id:'third',title:'Event',href:'/events/example?tab=details#join',category:'event'}]}/>);
 fireEvent.click(screen.getByRole('button',{name:'Event'}));
 expect(screen.getByRole('link',{name:banners[0].ctaLabel})).toHaveAttribute('href','/events/example?tab=details&locale=ja#join');
 expect(screen.getAllByText('イベント')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Next slide'}));
 expect(screen.getByRole('link',{name:banners[0].ctaLabel})).toHaveAttribute('href','/wena?locale=ja');
});
it('hides an empty placement and single-slide controls',()=>{
 const {rerender}=render(<DiscoveryCarousel locale='ko' banners={[]}/>);
 expect(screen.queryByRole('region')).toBeNull();
 rerender(<DiscoveryCarousel locale='ko' banners={discoveryBannerFixtures('ko').slice(0,1)}/>);
 expect(screen.queryByRole('button')).toBeNull();
});

it('preserves managed responsive artwork dimensions, alt text and layout roles',()=>{
 const banners=discoveryBannerFixtures('ko');
 const {container}=render(<DiscoveryCarousel locale='ko' banners={banners}/>);
 for(const [index,banner] of banners.entries()){
  const slide=container.querySelectorAll('article')[index];
  const image=slide.querySelector('img')!,mobile=slide.querySelector('source')!;
  expect(image).toHaveAttribute('src',banner.desktopImage.url);
  expect(image).toHaveAttribute('width',String(banner.desktopImage.width));
  expect(image).toHaveAttribute('height',String(banner.desktopImage.height));
  expect(image).toHaveAttribute('alt',banner.alt);
  expect(mobile).toHaveAttribute('srcset',(banner.mobileImage??banner.desktopImage).url);
  expect(mobile).toHaveAttribute('media','(max-width:1023px)');
  expect(slide).not.toHaveAttribute('data-image-layout');
 }
});

it('moves measured long copy below the image without using text length',()=>{
 const measure=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return {width:this.tagName==='ARTICLE'?300:276,height:this.className.includes('copy')?220:250,top:0,left:0,right:300,bottom:250,x:0,y:0,toJSON(){}};});
 const {container,unmount}=render(<DiscoveryCarousel locale='ko' banners={discoveryBannerFixtures('ko').slice(0,1)}/>);
 expect(container.querySelector('article')).toHaveAttribute('data-extended','true');
 unmount();measure.mockRestore();
});
