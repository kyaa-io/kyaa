import type {AnchorHTMLAttributes} from 'react';
export default function Link({prefetch:_,...props}:AnchorHTMLAttributes<HTMLAnchorElement>&{prefetch?:unknown}) {return <a {...props}/>;}
