# RUNMUSIC 이미지 출처와 프레이밍

2026-10-23 작업. `docs/design/image-framing.md`를 적용한다.

| 용도 | 저장소 파일 | 출처·처리 |
| --- | --- | --- |
| 요거트 상품 | `apps/web/public/images/runmusic/andong-yogurt-1l.png` | 사용자가 제공한 안동참마 폴더의 `IMG_2720.PNG`. 1206×2622 원본 픽셀을 그대로 보존했다. 화면에서는 SVG `viewBox="0 381 1206 1203"`로 사진 영역을 표시하고 휴대전화 UI를 제외한다. |
| 스타벅스 상품권 | `apps/web/public/images/kyaa-wave/starbucks-10000-voucher.jpg` | 저장소의 기존 1만원 상품권 이미지. 원본을 교체하거나 바코드를 생성하지 않았다. |
| 홈 데스크톱 배너 | `apps/web/public/images/runmusic/banner-desktop.png` | imagegen 생성 1774×887. 러닝 트랙이 음악 파형으로 이어지는 일러스트. |
| 홈 모바일 배너 | `apps/web/public/images/runmusic/banner-mobile.png` | 같은 배너를 세로 구도로 편집한 1122×1402 이미지. 새 콘셉트가 아니다. |

배너 생성 방향은 짙은 남색 배경, 핑크·보라색 트랙과 음악 파형, 실제 행사 사진처럼 보이지 않는 추상 일러스트다. 데스크톱 왼쪽과 모바일 아래쪽에 문구 공간을 남겼으며 글자·로고·인물·제품은 생성하지 않았다. 제목·상품 수량·CTA는 기존 ManagedHomeBanner가 실제 텍스트로 렌더링한다. 요거트의 생성형 누끼 시안은 제품 라벨을 바꿔 채택하지 않았다.

상품 원본과 실제 390/1440px 화면을 각각 확인했다. 배너는 기존 홈 프레임에서 390/768/1440px을 확인했다. 사진의 원본 구도와 배너의 역할별 크롭을 보존하며, 제품 사진을 확대해 채우거나 필수 상품 내용을 잘라내지 않는다. 캡처는 로컬 예시 데이터이며 `release-notes/images/2026-10-23-runmusic-*-local.png`에 공개 가능한 화면만 첨부한다.

## 생성 프롬프트

Desktop (`transparent_background=false`):

> Create one premium wide landscape festival promotional background artwork for RUN&MUSIC, a running and music festival collaboration with kyaa. Landscape 2:1 composition, ideally 1600x800. This is an abstract editorial 3D illustration, not a photograph of a real venue. Concept: a sculptural three-lane running track in luminous coral pink folds into a rhythmic audio waveform/ribbon in electric violet and cobalt, flowing upward on the RIGHT half of the frame. A few precise golden light sparks suggest concert energy; subtle realistic material and beautiful studio lighting. Deep midnight-indigo edge-to-edge backdrop. Sophisticated, joyful, minimal luxury event campaign, strong dimension, no clip-art icons, no grid, no neon wireframes, no people. LEFT 52% must remain dark and quiet with almost no objects for a large white HTML headline and CTA added by the website. Main track-wave sculpture occupies upper right and stays inside frame with comfortable breathing room. No text, lettering, logos, numbers, labels, watermarks or product packaging. Render crisp polished advertising artwork with a distinctive graceful arc, not generic blurry gradients.

Mobile (desktop image reference, `transparent_background=false`):

> Adapt this exact approved RUN&MUSIC abstract campaign artwork into the mobile version of the SAME DESIGN. Portrait 4:5 composition (ideally 1024x1280). Keep the identical luminous coral-pink running track folding into violet/cobalt sound-wave ribbons, midnight-indigo background, precise golden light sparks, material and lighting. Move and recompose the graceful track-wave sculpture into the UPPER 48% with the full main sculptural arc visible, centered slightly right. The LOWER 52% should be clean deep midnight-indigo with only very faint ambient light, explicitly reserved for a white live HTML title, description and button. No hard horizontal seam; background must be continuous and richly dark edge to edge. No lettering, text, logos, numbers, people, products, labels, icons or watermarks. Mobile advertising composition, crisp high-end 3D art, same artwork family not a different concept.
