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

mini에 Aside CLI와 로그인된 Aside u0 프로필이 먼저 있어야 한다. 이 작업 당시 SSH는 연결되지만 로그인 셸에서도 Aside 실행 파일을 찾지 못했다. 원격 Aside 접근도 `Remote Control requires the Pro plan`으로 거절됐다. 다른 브라우저로 우회하지 않았다.

`~/.config/kyaa-sns/config.json`의 기본값은 `{"target":"dev","devVerified":false}`. `sources.json`은 `{celebritySlug,platform,accountUrl}` 배열이며 CMS의 현재 활성 공식 계정 목록과 대조해야 한다. 이번 시험 목록은 11/10 보류 기록의 13개 계정으로 전체 현재 CMS 목록을 보증하지 않는다.

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
