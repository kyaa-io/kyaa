import styles from './empty-illustration.module.css';
export type EmptyIllustrationKind='page'|'search'|'people'|'notice'|'live'|'ticket'|'comment';
export type EmptyIllustrationSize='compact'|'regular';
const ink='#837b88';const accent='#f06a96';const soft='#fde4ed';const paper='#fff';
/** Decorative kyaa-owned SVG set for empty states. Callers always keep the visible title/description; this is aria-hidden. */
export function EmptyIllustration({kind,size='regular',className}:{kind:EmptyIllustrationKind;size?:EmptyIllustrationSize;className?:string}){
 const stroke={stroke:ink,strokeWidth:2.5,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 return <svg className={[styles.art,className].filter(Boolean).join(' ')} data-size={size} data-kind={kind} viewBox="0 0 160 120" aria-hidden="true" focusable="false">
  <ellipse cx="80" cy="104" rx="46" ry="6" fill="#ece8ef"/>
  <circle cx="80" cy="58" r="46" fill="#f5f2f7"/>
  <path d="M30 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={soft}/><circle cx="132" cy="30" r="4" fill={soft}/><circle cx="124" cy="92" r="3" fill="#e4e1e6"/>
  {kind==='page'&&<><rect x="46" y="28" width="68" height="56" rx="10" fill={paper} {...stroke} strokeDasharray="5 6"/><circle cx="80" cy="50" r="9" fill={soft} stroke={ink} strokeWidth="2.5"/><path d="M62 74c3-8 9-12 18-12s15 4 18 12" fill="none" {...stroke}/><circle cx="108" cy="82" r="13" fill={accent}/><path d="M108 76v12M102 82h12" stroke={paper} strokeWidth="3" strokeLinecap="round"/></>}
  {kind==='search'&&<><rect x="42" y="30" width="60" height="50" rx="10" fill={paper} {...stroke}/><path d="M54 46h30M54 58h20" fill="none" {...stroke}/><circle cx="102" cy="72" r="16" fill={paper} stroke={accent} strokeWidth="4"/><path d="M114 84l12 12" stroke={accent} strokeWidth="5" strokeLinecap="round"/><path d="M96 66l12 12M108 66L96 78" stroke={ink} strokeWidth="2.5" strokeLinecap="round"/></>}
  {kind==='people'&&<><circle cx="66" cy="50" r="12" fill={paper} {...stroke}/><path d="M42 86c2-14 11-22 24-22s22 8 24 22" fill={paper} {...stroke}/><circle cx="104" cy="56" r="10" fill={soft} stroke={ink} strokeWidth="2.5" strokeDasharray="4 5"/><path d="M88 88c1-10 8-16 16-16s15 6 16 16" fill="none" stroke={ink} strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round"/><circle cx="116" cy="38" r="9" fill={accent}/><path d="M116 34v8M112 38h8" stroke={paper} strokeWidth="2.5" strokeLinecap="round"/></>}
  {kind==='notice'&&<><path d="M44 52h18l30-18v52L62 68H44z" fill={paper} {...stroke}/><path d="M54 68l4 16h10l-4-16" fill={soft} {...stroke}/><path d="M104 46c6 4 6 20 0 24M112 38c12 10 12 34 0 44" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round"/></>}
  {kind==='live'&&<><rect x="38" y="36" width="84" height="52" rx="10" fill={paper} {...stroke}/><circle cx="80" cy="62" r="12" fill={soft} stroke={accent} strokeWidth="3"/><path d="M77 56l9 6-9 6z" fill={accent}/><rect x="46" y="44" width="26" height="12" rx="6" fill={accent}/><circle cx="53" cy="50" r="2.5" fill={paper}/></>}
  {kind==='ticket'&&<><path d="M40 44h80v12a8 8 0 000 16v12H40V72a8 8 0 000-16z" fill={paper} {...stroke}/><path d="M92 44v44" stroke={ink} strokeWidth="2.5" strokeDasharray="3 5" strokeLinecap="round"/><path d="M66 58l3.5 7 7.5 1-5.5 5 1.5 7.5-7-3.8-7 3.8 1.5-7.5-5.5-5 7.500-1z" fill={accent} transform="translate(-1 -6) scale(.9)"/></>}
  {kind==='comment'&&<><path d="M44 36h72a8 8 0 018 8v32a8 8 0 01-8 8H84l-16 14V84H44a8 8 0 01-8-8V44a8 8 0 018-8z" fill={paper} {...stroke}/><circle cx="64" cy="60" r="3.5" fill={ink}/><circle cx="80" cy="60" r="3.5" fill={ink}/><circle cx="96" cy="60" r="3.5" fill={accent}/></>}
 </svg>;
}
