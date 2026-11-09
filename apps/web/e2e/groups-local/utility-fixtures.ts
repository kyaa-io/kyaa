import {toContentLocale,type AppLocale} from '../../i18n/locales';
import {feedbackSummary} from '../lounge-local/feedback-fixture';
import {parsePassportCollection} from '../../features/passport/domain/passport-collection';
import {parsePassportDetailRecord} from '../../features/passport/domain/passport-detail';
export function utilityFixture(path:string,locale:AppLocale):Response|undefined{
 if(path==='/api/me/social/profile-link')return Response.json({token:'e9200000-0000-4000-8000-000000000003',expiresAt:new Date(Date.now()+86400000).toISOString()});
 if(path.startsWith('/api/me/social/profile-links/'))return Response.json({profile:{id:'e9200000-0000-4000-8000-000000000002',nickname:'팬 A',avatarUrl:'/images/avatars/star-pink.webp'},relationship:{friendshipId:null,status:'none'},capabilities:{canRequestFriend:true},isSelf:false});
 if(path!=='/api/passports'&&!path.startsWith('/api/passports/'))return;
 if(path.startsWith('/api/passports/')&&location.pathname==='/my'){const myState=new URLSearchParams(location.search).get('myState');if(myState==='passporterror')return Response.json({error:{code:'UNAVAILABLE'}},{status:503});if(myState==='passportloading')return new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}});}
 const passports=feedbackSummary(locale).creators.map(row=>({id:row.passport.id,owner:{nickname:'별빛'},celebrity:{slug:row.celebrity.slug,name:row.celebrity.name,image:{url:row.celebrity.image,alt:row.celebrity.name,position:row.celebrity.imagePosition??'center'}},businessStatus:'issued',mint:{status:'queued',txHash:null,tokenId:null},issuedAt:'2026-11-01T00:00:00Z',score:{points:row.passport.score,level:row.passport.tier},stampSummary:{knowledge:0,reservation:0,attendance:0,survey:0,membership:0,total:0}}));
 if(path==='/api/passports')return Response.json({passports:parsePassportCollection(passports,toContentLocale(locale))});
 const row=passports.find(p=>p.id===path.split('/')[3]);
 if(!row)return Response.json({error:{code:'NOT_FOUND'}},{status:404});
 const passport=parsePassportDetailRecord({...row,stamps:[],activities:[],nextBenefit:null,firstReaction:null},toContentLocale(locale));
 return Response.json({passport});
}
