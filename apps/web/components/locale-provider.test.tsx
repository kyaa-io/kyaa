import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DocumentLocale } from "./document-locale";
import { LocaleProvider, usePageLocale } from "./locale-provider";
import { AuthRoot } from "@/features/auth/client/auth-root";
import { PublicContentState } from "./public-content-state";

const state = vi.hoisted(() => ({ query: 'locale=en', pathname: '/', mounts: 0 }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname, useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock('./avatar-session-bridge', () => ({ AvatarSessionBridge: ({children}: {children: ReactNode}) => children }));
vi.mock('./byus-session-provider', () => ({ ByUsSessionProvider: ({children}: {children: ReactNode}) => children }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ CognitoAuthProvider: function TestProvider({children}: {children: ReactNode}) {
  useEffect(() => { state.mounts += 1; }, []);
  return children;
} }));

describe('document and authentication locale', () => {
  it('uses the server-selected locale on clean URLs and honors explicit legacy links', () => {
    function PageLocale() { return <output>{usePageLocale()}</output>; }
    state.query = '';
    const view = render(<LocaleProvider initialLocale="en"><PageLocale /></LocaleProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('en');
    state.query = 'locale=ko';
    view.rerender(<LocaleProvider initialLocale="en"><PageLocale /></LocaleProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('ko');
    state.query = 'locale=ja';
    view.rerender(<LocaleProvider initialLocale="en"><PageLocale /></LocaleProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('ja');
  });
  it('renders English loading content in the server output', () => {
    const html = renderToString(<LocaleProvider initialLocale="en"><PublicContentState state="loading" scope="home" /></LocaleProvider>);
    expect(html).toContain("Loading today");
    expect(html).not.toContain('불러오고');
  });
  it('updates document and loading copy without remounting authentication', () => {
    state.query = 'locale=en'; state.pathname = '/'; state.mounts = 0;
    const Tree = () => <LocaleProvider initialLocale="en"><AuthRoot><DocumentLocale /><PublicContentState state="loading" scope="home" /></AuthRoot></LocaleProvider>;
    const view = render(<Tree />);
    expect(document.documentElement.lang).toBe('en');
    state.query = 'locale=ko';
    view.rerender(<Tree />);
    expect(document.documentElement.lang).toBe('ko');
    expect(screen.getByRole('heading').textContent).toContain('불러오고');
    state.query = 'locale=en';
    view.rerender(<Tree />);
    expect(state.mounts).toBe(1);
  });
  it('uses the callback cookie on client navigation and lets an explicit query win', () => {
    document.cookie = "byus_locale=en; Path=/";
    state.pathname = '/settings/kakao/callback'; state.query = '';
    const Tree = () => <LocaleProvider initialLocale="ko"><DocumentLocale /><PublicContentState state="loading" scope="home" /></LocaleProvider>;
    const view = render(<Tree />);
    expect(document.documentElement.lang).toBe('en');
    state.query = 'locale=ko'; view.rerender(<Tree />);
    expect(document.documentElement.lang).toBe('ko');
    document.cookie = "byus_locale=; Max-Age=0; Path=/";
  });

});
