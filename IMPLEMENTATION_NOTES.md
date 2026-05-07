# IMPLEMENTATION_NOTES

이 문서는 `C:\Users\박준형\Desktop\mcops-reference`의 GPL-3.0 참고 저장소에서 기능 요구사항만 추출한 것이다.
원본 코드, 함수 구조, 클래스 구조, 파일 구조, 주석은 재사용하지 않는다.
현재 프로젝트는 TypeScript 기반 Discord Bot + GCE VM + VM 내부 mcops shell scripts 구조로 새로 구현한다.

## 1. Players 조회 방식

참고 저장소의 기능 요구사항:

- Minecraft 서버 상태 확인은 RCON 명령 결과를 기준으로 판단한다.
- player 목록/접속자 수 확인은 Minecraft의 player list 응답을 사용한다.
- RCON 연결이 실패하면 서버가 시작 중이거나 종료 중인 상태로 취급한다.
- 서버가 실행 중인지 여부와 player 조회 가능 여부를 분리해서 판단한다.

우리 프로젝트 적용 정책:

- Bot은 RCON에 직접 접근하지 않는다.
- RCON은 Minecraft VM 내부 localhost에서만 사용한다.
- Bot은 SSH로 `/opt/mcops/scripts/players.sh`만 실행한다.
- `players.sh`가 RCON player list 조회와 파싱을 담당한다.
- Bot은 `players.sh`의 stdout, stderr, exit code만 신뢰한다.
- player 조회 실패는 VM stop 조건으로 사용하지 않는다.

필요한 Bot 동작:

- `/players`는 remote script 실행 결과를 Discord에 표시한다.
- idle watcher도 직접 RCON 대신 `players.sh` 결과를 사용한다.
- remote command timeout, SSH 실패, non-zero exit는 player count unknown으로 처리한다.

## 2. Stop / Safe Shutdown 흐름

참고 저장소의 기능 요구사항:

- 수동 stop은 player가 없는 경우에만 서버 종료를 시도한다.
- player가 있으면 일반 stop으로는 종료하지 않는 정책을 둔다.
- 종료 요청은 Minecraft 명령을 통해 수행한다.
- 서버가 이미 내려간 상태이면 중복 종료를 시도하지 않는다.

우리 프로젝트 적용 정책:

- Bot은 Minecraft stop 명령을 직접 실행하지 않는다.
- Bot은 SSH로 `/opt/mcops/scripts/safe-stop.sh`를 실행한다.
- `safe-stop.sh`가 player count 확인, 저장, 백업, Minecraft 종료, 종료 확인을 모두 담당한다.
- Bot은 `safe-stop.sh`가 exit code `0`을 반환한 경우에만 GCE VM stop을 호출한다.
- `safe-stop.sh` 실패, timeout, SSH 실패, unknown 상태에서는 VM stop을 금지한다.

safe-stop 요구 흐름:

1. RCON 연결 가능 여부 확인
2. player count 확인
3. player가 있고 force 옵션이 없으면 실패
4. Minecraft `save-all` 실행
5. 백업 생성
6. 최근 백업 retention 적용
7. Minecraft stop 실행
8. Minecraft process 종료 확인
9. 성공 시 exit code `0` 반환

권장 실패 코드 정책:

- `0`: 성공
- `10`: player online, force 없음
- `20`: RCON 사용 불가
- `30`: 저장 실패
- `40`: 백업 실패
- `50`: stop 명령 실패
- `60`: 종료 확인 timeout
- `70`: 설정 오류
- `80`: script lock 획득 실패

## 3. Idle Auto Shutdown 흐름

참고 저장소의 기능 요구사항:

- 서버 시작 후 일정 시간이 지나면 자동 종료 감시를 시작한다.
- 주기적으로 player가 없는지 확인한다.
- player가 없을 때만 종료 명령을 시도한다.
- 서버가 계속 실행 중이면 감시 루프를 유지한다.

우리 프로젝트 적용 정책:

- idle watcher는 Bot 프로세스에서 실행한다.
- player 확인은 SSH로 `/opt/mcops/scripts/players.sh`를 실행해서 판단한다.
- player count가 `0`인 상태가 설정된 idle timeout 이상 지속될 때만 safe shutdown을 요청한다.
- idle shutdown은 force 없이 실행한다.
- player가 1명 이상이면 idle timer를 reset한다.
- player 조회 실패는 idle timer를 reset하거나 unknown 상태로 보고 shutdown하지 않는다.
- shutdown 실행 중에는 중복 shutdown을 막는 lock이 필요하다.

필요 설정:

- `IDLE_WATCHER_ENABLED`
- `IDLE_CHECK_INTERVAL_SECONDS`
- `IDLE_TIMEOUT_SECONDS`
- `REMOTE_COMMAND_TIMEOUT_SECONDS`
- `DISCORD_OPS_CHANNEL_ID` optional

## 4. Backup 관련 로직

참고 저장소에서 확인한 사항:

- 명시적인 world backup 기능은 확인되지 않았다.
- shutdown 전 백업, 백업 retention, Cloud Storage 업로드 요구사항은 현재 프로젝트에서 새로 정의해야 한다.

우리 프로젝트 적용 정책:

- Bot은 world directory를 직접 읽지 않는다.
- Bot은 압축 파일을 직접 만들지 않는다.
- Bot은 SSH로 `/opt/mcops/scripts/backup.sh`만 실행한다.
- `backup.sh`가 world 저장소 접근, 압축, retention, optional upload를 담당한다.
- `/backup` command는 script의 stdout, stderr, exit code를 표시한다.
- `backup.sh` 실패는 safe shutdown 실패로 이어져야 한다.

VM 내부 backup 요구사항:

- backup 대상 world 경로는 VM 내부 설정 파일에서 읽는다.
- backup output directory는 VM 내부 설정 파일에서 읽는다.
- 파일명은 시간 기반으로 충돌을 피한다.
- 최근 7개 유지 정책을 기본값으로 둔다.
- Cloud Storage 업로드는 optional로 둔다.
- local backup 성공과 cloud upload 실패를 어떻게 처리할지 명확한 정책을 둔다.

## 5. Discord Command 목록

참고 저장소의 command 기능 요구사항:

- `/start`: Minecraft 서버 시작
- `/stop`: player가 없을 때 Minecraft 서버 종료
- `/info`: 서버 주소, 실행 상태, player 정보 표시
- `/ipcheck`: 서버 주소 접속성 확인 및 주소 갱신 보조
- `/say`: Discord 메시지를 Minecraft 서버로 전달
- `/help`: command 도움말 표시
- `/cmd`: 허용된 운영자만 Minecraft command 실행
- `/ipset`: 허용된 운영자만 서버 주소 수동 변경

우리 프로젝트 1차 command 범위:

- `/start`: GCE VM start
- `/stop`: safe-stop script 성공 후 GCE VM stop
- `/status`: GCE VM 상태와 remote script 기반 Minecraft 상태 표시
- `/players`: SSH로 `players.sh` 실행
- `/backup`: SSH로 `backup.sh` 실행

우리 프로젝트에서 보류할 기능:

- Discord와 Minecraft chat bridge
- 임의 Minecraft command 실행
- 서버 주소 자동 갱신
- `/say`
- `/help` 전용 command

보류 이유:

- 임의 command 실행은 권한과 injection 위험이 크다.
- 현재 목표는 GCE VM lifecycle, player 조회, safe shutdown, backup이다.
- RCON은 VM 내부 script에서만 사용하는 방향으로 고정했다.

## 6. 설정값 목록

참고 저장소에서 확인한 설정 성격:

- Discord bot token
- 서버 접속 주소
- Minecraft start command
- 운영자 Discord user id 목록
- Discord chat channel id 목록
- Minecraft RCON 활성화 여부
- RCON password
- RCON host
- RCON port

우리 프로젝트 Bot 설정:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_OPS_CHANNEL_ID` optional
- `DEFAULT_COMPUTE_ZONE`
- `DEFAULT_INSTANCE_NAME`
- `GOOGLE_APPLICATION_CREDENTIALS` optional, GCP runtime에서는 service account 사용 가능
- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY_PATH`
- `SSH_CONNECT_TIMEOUT_SECONDS`
- `REMOTE_COMMAND_TIMEOUT_SECONDS`
- `IDLE_WATCHER_ENABLED`
- `IDLE_CHECK_INTERVAL_SECONDS`
- `IDLE_TIMEOUT_SECONDS`

우리 프로젝트 VM 내부 설정:

- `MINECRAFT_RCON_HOST`
- `MINECRAFT_RCON_PORT`
- `MINECRAFT_RCON_PASSWORD`
- `MINECRAFT_SERVICE_NAME`
- `MINECRAFT_WORLD_DIR`
- `BACKUP_DIR`
- `BACKUP_RETENTION_COUNT`
- `STOP_TIMEOUT_SECONDS`
- `BACKUP_UPLOAD_ENABLED`
- `GCS_BUCKET`
- `GCS_PREFIX`

## 7. 새 구현에 필요한 요구사항

Remote command 요구사항:

- Bot은 고정된 allowlist script만 실행한다.
- Discord 입력값을 shell command 문자열에 직접 삽입하지 않는다.
- script path는 Bot 코드 내부 allowlist 또는 안전한 config에서만 가져온다.
- SSH 연결 timeout과 command 실행 timeout을 분리한다.
- stdout, stderr, exit code, signal, duration, timeout 여부를 기록한다.
- timeout 또는 non-zero exit에서는 VM stop을 호출하지 않는다.

Script 요구사항:

- `/opt/mcops/scripts/players.sh`
  - RCON으로 player count를 확인한다.
  - 성공 시 machine-readable한 결과를 출력한다.
  - 실패 시 non-zero exit code를 반환한다.

- `/opt/mcops/scripts/backup.sh`
  - world backup을 생성한다.
  - retention 정책을 적용한다.
  - optional Cloud Storage upload를 지원할 수 있게 설계한다.
  - 성공/실패를 exit code로 명확히 반환한다.

- `/opt/mcops/scripts/safe-stop.sh`
  - player count를 먼저 확인한다.
  - force가 없고 player가 있으면 실패한다.
  - 저장, 백업, stop, 종료 확인을 순서대로 수행한다.
  - 모든 필수 단계 성공 시에만 exit code `0`을 반환한다.

Shutdown 요구사항:

- `/stop`은 safe-stop script 성공 후에만 GCE VM stop을 호출한다.
- safe-stop 실패 시 VM은 그대로 둔다.
- GCE VM이 이미 stopped면 safe-stop script를 실행하지 않는다.
- safe shutdown 중복 실행을 방지한다.
- Discord 응답은 단계별 결과와 실패 원인을 요약한다.

Idle watcher 요구사항:

- VM이 running일 때만 player 조회를 시도한다.
- player count unknown이면 shutdown하지 않는다.
- player count `0`이 timeout 이상 지속될 때만 safe shutdown을 호출한다.
- idle shutdown은 force 없이 실행한다.

테스트 요구사항:

- Remote command adapter는 실제 SSH 없이 mock으로 service test가 가능해야 한다.
- `/backup`은 script exit code별 응답을 테스트한다.
- safe shutdown은 script 성공 시에만 GCE stop이 호출되는지 테스트한다.
- idle watcher는 player count 변화와 timeout 조건을 테스트한다.

