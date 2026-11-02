import {createContext,useContext,useId,useState,type CSSProperties,type ReactNode} from 'react';
export const DetailContext=createContext<{code:string;act:(label:string,element:HTMLButtonElement)=>void}>({code:'',act:()=>{}});
export function SourceAction({label,style,nodeId,children}:{label:string;style:CSSProperties;nodeId:string;children:ReactNode}){
 const {act}=useContext(DetailContext);
 return <button type='button' aria-label={label} data-pencil-id={nodeId} style={style} onClick={e=>act(label,e.currentTarget)}>{children}</button>;
}
export function SourceField({label,text,kind,style,textStyle,nodeId}:{label:string;text:string;kind:'input'|'textarea'|'select';style:CSSProperties;textStyle:CSSProperties;nodeId:string}){
 const {code}=useContext(DetailContext),id=useId(),key=`pencil-draft:${code}:${label}`;
 const placeholder=/주세요|입력|선택|어떤|준비물|장소 또는|연결 예정/.test(text),[value,setValue]=useState(()=>sessionStorage.getItem(key)??(placeholder?'':text));
 const update=(next:string)=>{setValue(next);sessionStorage.setItem(key,next);};
 const props={id,required:['사진 설명','일정 이름','시작 일시','종료 일시','장소 또는 공식 링크','참여 안내','제목','내용','초대할 연락처','후기 제목','후기 내용','보완 설명'].includes(label),'aria-label':label,'data-pencil-id':nodeId,value,onChange:(e:{target:{value:string}})=>update(e.target.value),style:{...style,...textStyle,width:style.width??'100%',height:style.height,flex:'none',display:'block',margin:0,border:0,backgroundColor:style.backgroundColor??'#fff',fontFamily:textStyle.fontFamily??'"Pretendard Variable",sans-serif'}};
 if(kind==='select')return <select {...props}>{[text,...(label.includes('미션')?['응원 사진 인증','모임 설문']:label.includes('모임')||label.includes('초대')?['한강 러닝 크루','RUN&MUSIC']:['전체','진행 중','완료'])].map((v,i)=><option key={i} value={v}>{v}</option>)}</select>;
 return kind==='textarea'?<textarea {...props} placeholder={placeholder?text:undefined}/>:<input {...props} type={label.includes('이메일')||text.includes('이메일')?'email':'text'} placeholder={placeholder?text:undefined}/>;
}
export function SourceChoice({label,style,nodeId}:{label:string;style:CSSProperties;nodeId:string}){
 const {code}=useContext(DetailContext),key=`pencil-draft:${code}:${label}`,[checked,setChecked]=useState(()=>sessionStorage.getItem(key)==='true');
 return <label style={style} data-pencil-id={nodeId}><input type='checkbox' aria-label={label} checked={checked} onChange={e=>{setChecked(e.target.checked);sessionStorage.setItem(key,String(e.target.checked));}} style={{width:24,height:24,margin:0,flexShrink:0,accentColor:'#c81067'}}/><span style={{fontFamily:'"Pretendard Variable",sans-serif',fontSize:16,fontWeight:400,lineHeight:'24px',color:'#121212'}}>{label}</span></label>;
}
