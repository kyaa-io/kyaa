import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {CreatorBoardFooter} from './creator-board-footer';

describe('CreatorBoardFooter', () => {
  it('submits trimmed search, including empty to clear, and preserves action links', () => {
    const onSearch = vi.fn();
    render(<CreatorBoardFooter allHref="/artist?tab=board" writeHref="/artist?tab=board&compose=1" searchLabel="검색" allLabel="전체 보기" writeLabel="글쓰기" onSearch={onSearch}/>);
    const input = screen.getByRole('searchbox', {name:'검색'});
    expect(input).toHaveAttribute('maxLength', '100');
    fireEvent.change(input, {target:{value:'  별빛  '}});
    fireEvent.submit(input.closest('form')!);
    expect(onSearch).toHaveBeenLastCalledWith('별빛');
    fireEvent.change(input, {target:{value:'  '}});
    fireEvent.submit(input.closest('form')!);
    expect(onSearch).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('link', {name:'전체 보기'})).toHaveAttribute('href', '/artist?tab=board');
    expect(screen.getByRole('link', {name:'글쓰기'})).toHaveAttribute('href', '/artist?tab=board&compose=1');
  });

  it('omits the action row when no action links are given', () => {
    render(<CreatorBoardFooter searchLabel="검색" onSearch={vi.fn()}/>);
    expect(screen.getByRole('searchbox', {name:'검색'})).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
