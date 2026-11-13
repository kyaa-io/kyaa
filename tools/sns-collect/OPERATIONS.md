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
