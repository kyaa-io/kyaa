# 공용 리치 에디터

게시판 글(`fan_posts`)과 모임 글·운영 공지(`group_posts`)가 쓴다. kyaa 공식 공지(`celebrity_notices`, `components/admin/notice-manager.tsx`)는 자체 형식을 그대로 쓴다.

## 저장 형식

- `body`: 평문. 옛 클라이언트, 목록, 검색, 번역, 신고, 포인트 판정이 읽는다. 문서가 있으면 서버가 문서에서 만든다.
- `body_doc`: 정화된 문서(`rich-document.ts`). 노드 paragraph, heading(2·3), bulletList, orderedList, listItem, blockquote, horizontalRule, hardBreak, text, attachment(`assetId`, `kind`), youtube(`videoId`). 마크 bold, italic, underline, link(https만).
- 사진·영상은 id로만 가리키고 글에 붙은 첨부만 그린다. HTML을 저장하거나 그리지 않는다.
- 평문으로 수정되거나 `body`가 바뀌면 트리거가 `body_doc`을 지운다.

## 운영 공지에서 쓰기 (E)

```tsx
const body = useGroupPostBody({ locale, label, disabled: pending, initial: cur ? { body: cur.body, bodyDoc: cur.bodyDoc, assets: cur.assets } : undefined });
<form>
  {body.field}
  <button disabled={body.blocked} />
</form>
await run(path, method, { title, visibility, category: "notice", ...body.submission(title) });  // 성공하면 body.commit()
```

`features/groups/ui/group-post-body.tsx`. 수정 화면에는 글 상세(`GET /api/groups/{id}/posts/{postId}`)를 넘긴다. 목록 응답에는 `bodyDoc`이 없으니 목록 행을 그대로 넘기면 서식을 잃는다. 사진 5장 또는 영상 1개, 사진 8MB, mp4·mov 50MB는 훅이 지킨다.

다른 화면은 `LazyRichEditor`, `useRichPostBody`, `useRichPostUploads`를 조합하고, 읽기는 `RichBody`에 `renderAttachment`를 넘긴다. 서버 입력은 `prepareRichPostBody`로 통과시킨다.
