/**
 * 한국 운영사의 사업자등록증 기준 정보. 하단 사업자 정보가 이 한 곳만 읽는다.
 * 통신판매업 신고번호는 강남구청장 신고(2026-11-25) 번호이며, 공정거래위원회 공개 관행대로 붙여 쓴다.
 */
export const KOREA_BUSINESS_INFO = {
  companyName: "주식회사 셀리랩",
  representative: "김보석",
  registrationNumber: "736-86-03473",
  mailOrderNumber: "제2026-서울강남-06769호",
  address: "서울특별시 강남구 도산대로28길 46, 6층 및 7층 전체(논현동)",
  phone: "010-6434-8327",
  email: "support@kyaa.io",
  hostingProvider: "Amazon Web Services",
  // 공정거래위원회 통신판매사업자 정보 공개 페이지(사업자등록번호 숫자만).
  lookupUrl: "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=7368603473",
} as const;
