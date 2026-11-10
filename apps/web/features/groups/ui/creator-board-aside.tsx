import type {AppLocale} from '@/i18n/locales';
import type {MySummary} from '@/features/my/domain/my-summary';

export type CreatorBoardEvent={title:string;image:string;href:string;exchangeHref?:string};
/** Activity and rewards belong on the home tab, leaving the board focused on posts. */
export function CreatorBoardAside(_props:{slug:string;locale:AppLocale;owned?:MySummary['creators'][number];passportId?:string|null;event?:CreatorBoardEvent}){
 return null;
}
