// Synthetic local fixture; renders the production result component without a live account or DB.
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { QuizResultScreen } from "@/features/quiz/ui/quiz-result-screen";
const id = (n: number) => `19300000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const questions = [1,2,3].map(position => ({ id:id(position), position, prompt:position === 1 ? "처음 무대에 오른 해는 언제인가요?" : "크리에이터가 팬들과 나눈 이야기는 무엇인가요?", responseKind:"choice", selectedOptionId:id(position+10), freeText:null, options:[{id:id(position+10),position:1,label:"선택한 보기"},{id:id(position+20),position:2,label:"다른 보기"}], ...(position < 3 ? {learning:{hint:position===1 ? "공식 채널의 데뷔 무대 소개에서 첫 활동 이야기를 찾아보세요." : null,links:[{title:"YouTube",url:"https://www.youtube.com/@KARAofficial"}]}} : {}) }));
const originalFetch=window.fetch.bind(window);
window.fetch=async (input,init) => {
 const url=String(input);
 if(url.startsWith("/api/quiz-attempts/")) return Response.json({attempt:{attempt:{id:id(99),status:"failed",score:1,submittedAt:"2026-11-11T10:00:00Z"},questions}});
 if(url.includes("/quiz/attempts")) return Response.json({result:{kind:"attempt",attempt:{id:id(100),status:"open",score:null,submittedAt:null},questions:questions.map(({learning,...q})=>({...q,selectedOptionId:null}))}});
 if(url.startsWith("/api/")) return Response.json({});
 return originalFetch(input,init);
};
createRoot(document.getElementById("root")!).render(<QuizResultScreen attemptId={id(99)} passportId={null} celebritySlug="kara" celebrityName="카라" locale="ko"/>);
