import {lazy,Suspense} from 'react';
export default function dynamic(load) { const C=lazy(load); return function Dynamic(props) {return <Suspense fallback={null}><C {...props}/></Suspense>}; }
