# SNS-INGEST-FIX-1113 인계

비밀 값은 GitHub Secret이 아니라 `AWS_PLATFORM_CONFIG_JSON.parameters.RuntimeConfigSecretArn`이 가리키는 Secrets Manager JSON의 `SNS_INGEST_SECRET`에 둔다. 같은 GitHub 환경 변수의 `runtimeSecretKeys`에도 이름이 있어야 ECS에 들어간다. Secrets Manager 수정만으로 기존 컨테이너가 갱신되지는 않는다.

## 감독의 운영 설정 명령 (아직 실행하지 않음)

저장소 루트에서 실행한다. 기존 JSON의 다른 키는 보존하며 값은 출력하지 않는다. 운영 키는 dev와 별도로 생성한다.

```sh
python3 tools/sns-collect/configure-secret.py prod
python3 tools/sns-collect/configure-secret.py prod --execute
```

그 다음 기존 승인된 dev 실행 ID를 사용해 운영 승격한다. `DEV_RUN_ID`는 최종 성공을 확인한 실제 실행 ID로 설정한다.

```sh
gh workflow run aws-platform.yml --repo kyaa-io/kyaa --ref main -f environment=prod -f source_run_id="$DEV_RUN_ID" -f require_forward_only=true
```

## mini 설치와 전환

mini에 Aside CLI와 연결된 Aside u0 프로필이 필요하다. 11/13 사용자 설치·로그인 뒤 CLI 1.26.1113.1717과 Profile 0 연결을 확인했다. Instagram은 로그인 완료했고, TikTok은 로그인 없이 공개 게시물 원문을 읽을 수 있음을 확인했다. 수집은 mini 로컬 Aside를 사용한다.

`~/.config/kyaa-sns/config.json`의 기본값은 `{"target":"dev","devVerified":false}`. `sources.json`은 `{celebritySlug,platform,accountUrl}` 배열이며 CMS의 현재 활성 공식 계정 목록과 대조해야 한다. 11/13 dev CMS의 공개 크리에이터·활성 공식 계정을 직접 조회해 22개 출처로 갱신했다. 기존 13개 실행, 전체 22개 실행, 목록 확인 실패 3개 계정의 후속 검증은 기록을 분리한다.

mini의 지정 checkout에 이 변경을 반영한 뒤, dev 키·설정·출처 목록을 비공개 경로로 복사한다. 운영 키와 대상 전환은 감독만 실행한다.

```sh
ssh kyaa-mini 'mkdir -p ~/.config/kyaa-sns ~/.local/share/kyaa-sns-collector ~/Library/LaunchAgents; chmod 700 ~/.config/kyaa-sns'
scp tools/sns-collect/collect-core.mjs tools/sns-collect/collect.aside.mjs tools/sns-collect/run.py kyaa-mini:.local/share/kyaa-sns-collector/
scp ~/.config/kyaa-sns/dev.secret ~/.config/kyaa-sns/config.json ~/.config/kyaa-sns/sources.json kyaa-mini:.config/kyaa-sns/
scp tools/sns-collect/io.kyaa.sns-collect.plist kyaa-mini:Library/LaunchAgents/
ssh kyaa-mini 'chmod 600 ~/.config/kyaa-sns/*.secret ~/.config/kyaa-sns/*.json; python3 ~/.local/share/kyaa-sns-collector/run.py'
```

Aside가 준비되면 dev 대상으로 launchd 자체를 확인한다. 다른 작업이 아닌 이 작업의 label만 재등록한다.

```sh
ssh kyaa-mini 'launchctl bootout gui/$(id -u)/io.kyaa.sns-collect 2>/dev/null || true; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.kyaa.sns-collect.plist; launchctl kickstart gui/$(id -u)/io.kyaa.sns-collect'
```

launchd 실행 결과와 dev의 신규 저장·원문·보류 여부까지 확인한 후 mini의 config.json에 `devVerified:true`를 기록한다. 운영 런타임 반영까지 확인한 뒤:

```sh
scp ~/.config/kyaa-sns/prod.secret kyaa-mini:.config/kyaa-sns/
ssh kyaa-mini 'chmod 600 ~/.config/kyaa-sns/prod.secret; python3 -c '\''import json,pathlib; p=pathlib.Path.home()/".config/kyaa-sns/config.json"; c=json.loads(p.read_text()); assert c.get("devVerified"); c["target"]="prod"; p.write_text(json.dumps(c))'\'''
ssh kyaa-mini 'launchctl kickstart gui/$(id -u)/io.kyaa.sns-collect'
```

`StartInterval=7200`(2시간), RunAtLoad=false. 잠자기·로그아웃·Aside 종료 상태에서는 정확한 시각 실행이 보장되지 않는다. 실행 중복은 파일 잠금으로 막는다. 실패는 `~/.config/kyaa-sns/status.json`과 `runs/<UTC>/run.log`, Mac 알림으로 남긴다. API가 받은 출처의 장기 실패는 기존 서버 알림을 재사용한다. Mac 자체가 꺼진 경우의 새 외부 알림 기능은 추가하지 않았다.

사진·영상 표지는 서버의 PHOTO_REVIEW_REQUIRED 보류를 유지한다. 수집 성공과 공개 성공은 다르다.

mini 실행 코드는 공유 checkout 대신 `~/.local/share/kyaa-sns-collector/`에 고정 복사한다. dev 상태에서 launchctl bootstrap과 kickstart로 먼저 검증한 뒤 운영으로 전환한다. 이미 등록된 작업은 bootout 후 다시 bootstrap한다.

비밀 JSON 갱신은 감독이 다른 런타임 비밀 수정과 겹치지 않게 직렬 실행한다. 강제 종료된 Aside 세션의 탭 정리는 보장되지 않으므로 timeout 뒤에는 해당 실행의 탭을 확인한다. 사용자 탭은 닫지 않는다.

11/13 mini에서 기존 `io.kyaa.sns-collect` label 하나를 등록하고 dev 대상으로 kickstart했다. 예약 간격은 7200초이며, 사용자 Instagram 탭을 보존하도록 수집 동시 탭을 2개로 제한한다. 운영 전환은 감독만 수행한다.

게시물 링크가 없는 프로필은 한 번 더 읽는다. Instagram 화면에 게시물 0개와 게시물 없음이 함께 표시될 때만 빈 수집을 정상으로 기록하며, 그 밖의 목록 확인 실패는 계속 오류로 알린다.

## 역순 공개 알림 인수 조건

`20261226151000_artist_new_post_source_order.sql`은 main의 `20261226150000_artist_new_post_notification.sql` 다음에 적용한다. SNS 원문 시각을 우선하고 직접 작성한 글은 공개 시각으로 비교한다. 늦게 공개된 과거 글도 묶음 개수와 미읽음 상태에는 반영하지만 대표 글은 과거로 바꾸지 않는다.

`supabase/tests/artist_new_post_reverse_publication.sql`은 최신 A → 과거 B에서 A 링크 유지, 개수 2와 미읽음 복귀, 더 최신 C에서 C로 이동을 검사한다. dev에서 main의 선행 migration과 수정 migration을 한 트랜잭션 안에 임시 적용하여 수정 전 실패·수정 후 통과를 확인했고 모두 롤백했다. 운영 및 dev의 영구 알림 함수는 변경하지 않았다. 통합 시 선행 migration이 필요하며, 다른 형태의 함수에 잘못 적용되지 않도록 본문 일치 검사를 둔다.

## YouTube 팔로워 주간 수집

기존 `io.kyaa.sns-collect`의 2시간 실행에서 대상 환경별 마지막 성공 시각을 확인하고 7일이 지나면 같은 SNS 전용 키로 내부 YouTube 수집 경로를 호출한다. 서버의 기존 `YOUTUBE_DATA_API_KEY`를 사용하며 Mac에 API 키를 복사하지 않는다. 서버 호출 실패 시 성공 시각을 갱신하지 않아 다음 실행에서 재시도한다. 숨김·응답 실패인 채널은 기존 수치를 유지한다. 기존 mini 실행 파일을 갱신할 때 `run.py`를 함께 복사한다.

### YouTube Shorts (2026-11-16)
기존 2시간 run.py가 마지막 성공 이후 6시간이 지나면 같은 SNS 전용 키로
`POST /api/internal/youtube-shorts`를 호출한다. 실패 시 성공 시각을 갱신하지 않는다.
활성 공식 채널의 UUSH 목록 최신 10개만 읽고 공개·임베드 가능·비라이브·180초 이하를 저장한다.
수집 행은 7일마다 다시 확인하며 삭제·비공개·임베드 불가이면 숨기고 댓글은 보존한다.
API 실패는 숨김으로 처리하지 않는다. 수동 등록 행은 갱신하지 않는다.
설치와 운영 실행은 감독 승인 후 mini에서 수행한다. 이번 변경은 저장소에만 적용한다.

## 두 대상 전송과 인스타·틱톡 팔로워 주간 수집 (SNS-FOLLOWERS-1116)

`config.json`의 `targets`(예: `["dev","prod"]`)로 한 번 수집한 결과를 두 대상에 보낸다. `prod`가 들어 있으면 `devVerified:true`가 필요하다. 예전 `target` 하나짜리 설정도 그대로 동작한다. 유튜브 주간 호출은 대상마다 `youtube-followers-<대상>.last-success`로 따로 센다.

인스타·틱톡 팔로워 수는 2시간 실행이 이미 여는 공식 프로필 화면에서 읽는다. 틱톡은 페이지 데이터의 정확한 수, 인스타는 화면 표기('428.3만')를 그대로 보낸다. 대상별 `platform-followers-<대상>.last-success`가 7일 이상 지났을 때만 `POST /api/internal/platform-followers`(같은 SNS 전용 키)로 보내고 성공하면 표식을 갱신한다. 실패하면 표식을 두어 다음 실행에서 다시 보낸다. 못 읽은 계정은 보내지 않는다(0으로 쓰지 않음). 서버는 지금 활성 공식 링크인 계정만 저장하고, 직접 입력한 행과 더 새 값은 덮어쓰지 않는다. 결과는 `runs/<UTC>/followers*.result.json`에 남는다.

치지직은 서버가 공식 Open API(`GET https://openapi.chzzk.naver.com/open/v1/channels?channelIds=`, Client-Id/Client-Secret만 필요, 응답의 `followerCount`, https://chzzk.gitbook.io/chzzk/chzzk-api/channel 2026-11-16 확인)로 읽는다. 라이브 상태에 쓰는 기존 `CHZZK_CLIENT_ID`·`CHZZK_CLIENT_SECRET`을 재사용하고, 수집기는 유튜브처럼 대상별 `chzzk-followers-<대상>.last-success`로 주 1회 `POST /api/internal/chzzk-followers`만 호출한다.

저장은 플랫폼 인자를 받는 `save_collected_platform_followers` 하나로 한다(인스타·틱톡·치지직, enum의 youtube도 받음). 기존 `save_collected_youtube_followers`는 그대로 두었다. 정리하려면 유튜브 경로가 새 함수를 `p_digits=3, p_text=null`로 부르게 바꿔 배포하고, 운영에서 옛 함수 호출이 없는 것을 확인한 뒤 별도 migration으로 옛 함수를 지운다.

mini 설치는 `collect-core.mjs`·`collect.aside.mjs`·`run.py` 세 파일을 함께 복사한다. 운영 반영에는 migration `20261228160000_platform_follower_collector.sql`과 웹 배포가 먼저 필요하다. 치지직은 운영 런타임에 `CHZZK_CLIENT_ID`·`CHZZK_CLIENT_SECRET`이 있어야 하며, 없으면 503으로 끝나 성공 표식을 남기지 않고 다음 실행에서 다시 시도한다.
