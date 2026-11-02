// Isolated renderer data for the real calendar panel. Never imported by production.
import {buildLiveCalendarMonth} from '../../features/live/domain/live-calendar';
export function serviceCalendarFixture(url:URL){
 if(url.pathname==='/api/live-events/calendar')return Response.json(buildLiveCalendarMonth({month:url.searchParams.get('month')??'2026-11',events:[]}));
 if(url.pathname==='/api/schedules')return Response.json({items:[],nextCursor:null});
}
