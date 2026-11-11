// PRIVY-EXIT-0005 1차 dev 전용. 잠정 신규 가입 주소용 "버리는" xpub를 만든다.
// - 시드는 이 프로세스 메모리에만 있고 어디에도 저장·출력하지 않는다(종료와 함께 폐기).
// - 그래서 이 xpub로 만든 주소는 누구도 서명할 수 없는 수신 전용 잠정 주소다. 최종 주소는 2차 signer의
//   강화 파생 주소(K4)로 교체한다. AWS 리소스를 만들지 않는다. 운영 설정에는 넣을 수 없다(aws-platform-deploy 거부).
// 실행: apps/web 에서 node scripts/dev-throwaway-xpub.mjs  → KYAA_WALLET_XPUB=xpub… 한 줄
import { randomBytes } from "node:crypto";
import { HDKey } from "viem/accounts";

const seed = randomBytes(32);
const xpub = HDKey.fromMasterSeed(Uint8Array.from(seed)).derive("m/44'/60'/0'").publicExtendedKey;
seed.fill(0);
console.log(`KYAA_WALLET_XPUB=${xpub}`);
