import { lazy, Suspense, type ComponentType } from 'react';
/** 하네스용 next/dynamic: 같은 지연 로드를 React.lazy로 한다(ssr 옵션은 브라우저 전용 하네스라 무시). */
export default function dynamic<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Lazy = lazy(load);
  return function Dynamic(props: P) { return <Suspense fallback={null}><Lazy {...props} /></Suspense>; };
}
