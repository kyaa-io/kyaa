// Local synthetic API examples; no operational users or scores are created.
export function membersFixture(url:URL,state:string|null){
 if(/^\/api\/groups\/[^/]+\/presence$/.test(url.pathname))return{onlineCount:12,todayCount:128,artists:[]};
 if(!/^\/api\/groups\/[^/]+\/people$/.test(url.pathname))return undefined;
 const mode=url.searchParams.get("mode"),search=url.searchParams.get("search")??"",cursor=url.searchParams.get("cursor"),names=["별빛","하늘","보라","긴 닉네임이 여러 줄로 이어져도 프로필과 팬 점수가 겹치지 않는 회원","은하","달빛","구름","함께하는 팬"];
 const all=names.map((nickname,i)=>({profileId:`e9700000-0000-4000-8000-00000000000${i+1}`,nickname,avatarUrl:`/images/avatars/${["star-pink","heart-lavender","star-cream"][i%3]}.webp`,role:i===0?"owner":"member",rank:mode==="ranking"?i*2+1:null,points:mode==="ranking"?2400-i*120:null}));
 const filtered=all.filter((row,i)=>(mode!=="friends"||i%2===1)&&row.nickname.includes(search));
 const start=cursor?filtered.findIndex(row=>row.profileId===cursor)+1:0,items=state==="empty"||state==="threshold"?[]:filtered.slice(start,start+4);
 return {items,nextCursor:state!=="empty"&&state!=="threshold"&&start+4<filtered.length?items.at(-1)!.profileId:null,ranking:mode==="ranking"?{available:state!=="threshold",reason:state==="threshold"?"threshold":null,asOf:"2026-11-01T00:00:00Z",fanCount:state==="threshold"?99:128}:null};
}
