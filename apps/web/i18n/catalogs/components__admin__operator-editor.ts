export const operatorEditor = {
  ko: {
    title: "영어 탭에서 제목을 입력해 주세요.", slug: "주소는 영문 소문자와 숫자로 입력하고 단어 사이는 하이픈(-)으로 이어 주세요.",
    duplicate: "이미 사용 중인 주소예요. 다른 주소를 입력해 주세요.", type: "JPG, PNG 또는 WebP 사진을 선택해 주세요.",
    size: "8MB 이하의 사진을 선택해 주세요.", request: "공지를 처리하지 못했어요. 다시 시도해 주세요.",
    upload: "사진을 올리지 못했어요. 다시 시도해 주세요.", status: "공개 상태", kind: "종류",
  },
  en: {
    title: "Enter a title in the English tab.", slug: "Use lowercase letters and numbers with hyphens between words.",
    duplicate: "This URL name is already in use. Choose another.", type: "Choose a JPG, PNG or WebP image.",
    size: "Choose an image of 8 MB or less.", request: "Could not process the notice. Please try again.",
    upload: "Could not upload the image. Please try again.", status: "Publication status", kind: "Type",
  },
} as const;
