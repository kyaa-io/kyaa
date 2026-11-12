# 숏폼 보기 화면 근거 (2026-11-12)

## 플레이어

| 플랫폼 | 현재 보기 화면 | 상태 적용·읽기 | 자동재생 제한 |
| --- | --- | --- | --- |
| TikTok | 사용 | Embed Player v1의 `mute`/`unMute` 메시지, `onMute` 수신 | 현재 `autoplay=0`. 정책 오류 3002를 받으면 음소거하고 소리 버튼 강조 |
| YouTube | 사용 | IFrame API의 `mute()`/`unMute()`·`isMuted()`; 변경 전용 이벤트가 없어 상태 이벤트와 조회 사용 | 현재 `autoplay=0`. `onAutoplayBlocked`를 받으면 음소거하고 소리 버튼 강조 |
| 자체 video | 이 화면에 없음 | 적용 대상 없음. 자체 영상 보기 화면에 추가할 때 `video.muted`·`volumechange` 사용 | `play()` 거절 시 음소거 재시도 필요 |
| Instagram | 이 화면의 데이터 유형에 없음 | 공개 임베드의 음소거 제어/변경 이벤트 계약 확인 전에는 이 화면에 넣지 않음. 도입 시 자체 소리 버튼으로 통일 | 미검증 |

공식 근거: [TikTok Embed Player](https://developers.tiktok.com/docs/en/embed-player), [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [YouTube 플레이어 파라미터](https://developers.google.com/youtube/player_parameters), [MDN 자동재생 가이드](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

## 하단 UI 비교

- [TikTok 공식 데스크톱 화면 캡처: 영상과 우측 반응 레일](https://p16-va-tiktok.ibyteimg.com/obj/musically-maliva-obj/9da734816ba2248ce6042007434d79e0.jpeg): 세로 영상 옆에 반응을 쌓아 영상 프레임을 비운다.
- [TikTok 공식 데스크톱 화면 캡처: 다른 영상의 동일 배치](https://p16-va-tiktok.ibyteimg.com/obj/musically-maliva-obj/8aa2362994d2a2079356e25012eaca1e.jpeg): 영상 아래 설명과 측면 반응을 분리한다.

현재 모달은 측면 여유가 작은 390px 화면까지 지원하므로 하단 조작을 한 줄로 묶고 모바일 이동 화살표를 숨겼다. 위 캡처는 레이아웃 참고이며 현재 화면의 시각 검증을 대신하지 않는다.
