# 공용 리치 에디터

게시판 글(`fan_posts`)과 모임 글·운영 공지(`group_posts`)가 쓴다. kyaa 공식 공지(`celebrity_notices`, `components/admin/notice-manager.tsx`)는 자체 형식을 그대로 쓴다.

## 저장 형식

- `body`: 평문. 옛 클라이언트, 목록, 검색, 번역, 신고, 포인트 판정이 읽는다. 문서가 있으면 서버가 문서에서 만든다.
- `body_doc`: 정화된 문서(`rich-document.ts`). 노드 paragraph, heading(2·3), bulletList, orderedList, listItem, blockquote, horizontalRule, hardBreak, text, attachment(`assetId`, `kind`), youtube(`videoId`). 마크 bold, italic, underline, link(https만).
- 사진·영상은 id로만 가리키고 글에 붙은 첨부만 그린다. HTML을 저장하거나 그리지 않는다.
- 평문 수정(옛 웹, 모바일 앱)은 `body`만 바꾸고 문서를 지우지 않는다. 읽을 때 서버가 문서를 현재 평문과 첨부에 맞춘다(`richDocumentForPost`). 바뀌지 않은 줄의 서식과 미디어가 남는다. 계정 삭제만 문서를 지운다.
- 문서는 `format=rich`를 요청한 읽기에만 나간다. `/api/posts/{id}?format=rich`, `/api/groups/{id}/posts/{postId}?format=rich`.

## 운영 공지에서 쓰기 (E)

```tsx
const body = useGroupPostBody({ locale, label, disabled: pending, initial: cur ? { body: cur.body, bodyDoc: cur.bodyDoc, assets: cur.assets } : undefined });
<form>
  {body.field}
  <button disabled={body.blocked} />
</form>
await run(path, method, { title, visibility, category: "notice", ...body.submission() });  // 성공하면 body.commit()
```

`features/groups/ui/group-post-body.tsx`. 수정 화면에는 글 상세(`GET /api/groups/{id}/posts/{postId}?format=rich`)를 넘긴다. `initial`에 `bodyDocUnavailable`까지 넘겨야 한다. 문서를 읽지 못한 글을 평문으로 열어 저장하면 문서를 덮기 때문에, 훅이 에디터 대신 이유를 보여 주고 `blocked`를 켠다. 목록 응답에는 `bodyDoc`이 없으니 목록 행을 그대로 넘기면 서식을 잃는다. 사진 5장 또는 영상 1개, 사진 8MB, mp4·mov 50MB는 훅이 지킨다.

다른 화면은 `LazyRichEditor`, `useRichPostBody`, `useRichPostUploads`를 조합하고, 읽기는 `RichBody`에 `renderAttachment`를 넘긴다. 서버 입력은 `prepareRichPostBody`로 통과시킨다.

## 상한

- 글자: 모임 20,000자, 팬 게시판 제목 포함 5,000자.
- 문서: 256KB, 노드 20,000개(`RICH_DOCUMENT_MAX_BYTES`). 넘으면 화면이 이유를 알리고 저장을 막는다. 줄이 아주 많은 글은 글자 상한 전에 여기에 닿을 수 있다.
- 요청: 문서 상한 + 32KB. 문서를 보낼 때 `body`는 보내지 않는다(팬 게시판은 제목만). 서버가 문서에서 만든다.
- 빈 문단은 `body`에서 빈 줄이다. 양 끝의 빈 줄은 저장하지 않는다.
